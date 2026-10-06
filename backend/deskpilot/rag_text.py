"""Structure-aware text extraction and deterministic retrieval primitives."""
from __future__ import annotations

import io
import re
from pathlib import Path


def token_spans(text):
    # Approximation only: CJK/punctuation 1 token, Latin pieces about 4 characters.
    for match in re.finditer(r"[\u3400-\u9fff]|[A-Za-z0-9_]+|[^\s]", text):
        value = match.group()
        for offset in range(0, len(value), 4):
            yield (match.start() + offset, min(match.end(), match.start() + offset + 4))


def token_count(text):
    return sum(1 for _ in token_spans(text))


def parse_document(filename: str, content: bytes) -> list[dict]:
    suffix = Path(filename).suffix.lower()
    sections = []
    if suffix in (".txt", ".md", ".markdown"):
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = content.decode("gb18030")
        headings, lines = [], []
        def flush():
            if "\n".join(lines).strip():
                sections.append({"anchor": " > ".join(headings) or "正文", "text": "\n".join(lines).strip()})
            lines.clear()
        fenced = False
        for line in text.splitlines():
            if line.strip().startswith(("```", "~~~")):
                fenced = not fenced
            heading = re.match(r"^(#{1,6})\s+(.+)$", line) if suffix != ".txt" and not fenced else None
            if heading:
                flush()
                depth, title = len(heading[1]), heading[2].strip()
                headings[:] = headings[:depth - 1] + [title]
            lines.append(line)
        flush()
    elif suffix == ".docx":
        from docx import Document
        from docx.table import Table
        from docx.text.paragraph import Paragraph
        document = Document(io.BytesIO(content))
        heading, lines = "正文", []
        def flush_docx():
            if lines:
                sections.append({"anchor": heading, "text": "\n".join(lines)})
                lines.clear()
        for element in document.element.body.iterchildren():
            if element.tag.endswith("}p"):
                paragraph = Paragraph(element, document)
                if paragraph.style and paragraph.style.name.startswith("Heading"):
                    flush_docx()
                    heading = paragraph.text
                if paragraph.text.strip():
                    lines.append(paragraph.text)
            elif element.tag.endswith("}tbl"):
                table = Table(element, document)
                for row in table.rows:
                    lines.append("| " + " | ".join(cell.text.replace("\n", " / ") for cell in row.cells) + " |")
        flush_docx()
    elif suffix == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        for number, page in enumerate(reader.pages, 1):
            if "/Contents" not in page:
                continue
            text = page.extract_text(extraction_mode="layout") or ""
            if text.strip():
                sections.append({"anchor": f"第 {number} 页", "page": number, "text": text.strip()})
        if not sections:
            raise ValueError("PDF 没有可提取的文字；扫描 PDF 需要先完成 OCR。")
    else:
        raise ValueError("只支持 Markdown、TXT、DOCX 和文字型 PDF")
    if not sections:
        raise ValueError("文件没有可提取内容")
    return sections


def chunk_sections(sections: list[dict], size: int = 400, overlap: int = 60) -> list[dict]:
    chunks = []
    for section in sections:
        text = section["text"]
        spans = list(token_spans(text))
        for start in range(0, len(spans), size - overlap):
            end = min(start + size, len(spans))
            piece = text[spans[start][0]:spans[end - 1][1]].strip()
            if piece:
                chunks.append({**section, "text": piece, "token_count": end - start, "ordinal": len(chunks)})
            if end == len(spans):
                break
    return chunks


def reciprocal_rank_fusion(rankings: list[list[str]], k: int = 60) -> list[dict]:
    merged = {}
    for source, ranking in enumerate(rankings):
        for rank, chunk_id in enumerate(ranking[:20], 1):
            item = merged.setdefault(chunk_id, {"id": chunk_id, "score": 0, "ranks": [None] * len(rankings)})
            item["score"] += 1 / (k + rank)
            item["ranks"][source] = rank
    return sorted(merged.values(), key=lambda row: (-row["score"], row["id"]))


_STOPWORDS = set("的 了 是 在 和 与 或 怎么 如何 什么 为什么 请 问 处理 需要 可以 一个 我 我们 你 您 帮 帮助 一下 为 对 吗 呢 后 这 那 有 要 将 该 the a an is are to for of and how what please".split())


def lexical_tokens(text):
    import jieba
    return [token.lower() for token in jieba.lcut(text) if re.search(r"[\w\u3400-\u9fff]", token)
            and token.lower() not in _STOPWORDS]


def normalized_identifier(text):
    text = re.sub(r"\bwin(?=\s*\d)", "windows", text.lower())
    return re.sub(r"[\s_/-]+", "", text)


def version_facets(text):
    """Read platform and application-version facets without corpus-specific query rules."""
    lowered = text.lower()
    platform = re.search(r"(windows|win|macos|android|ios|linux)\s*(\d+(?:\.\d+)*)?", lowered)
    facets = {}
    if platform:
        facets["platform"] = "windows" if platform[1] == "win" else platform[1]
        if platform[2]:
            facets["platform_version"] = platform[2]
        lowered = lowered[:platform.start()] + " " + lowered[platform.end():]
    versions = re.findall(r"(?<![a-z0-9.])v?(\d+\.\d+(?:\.\d+)*)(?![\d.])", lowered)
    if versions:
        facets["app_version"] = versions[-1]
    if "经典版" in lowered:
        facets["edition"] = "经典版"
    elif "新版" in lowered:
        facets["edition"] = "新版"
    return facets


def facets_conflict(first, second):
    return any(first[key] != second[key] for key in first.keys() & second.keys())
