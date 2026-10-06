"""One locked Qdrant local client per directory, with disposable derived data."""
import threading
import uuid
from pathlib import Path

from qdrant_client import QdrantClient, models


class LocalVectors:
    _registry = {}
    _registry_lock = threading.RLock()

    def __init__(self, path: Path, dimensions: int):
        self.path = str(path.resolve())
        self.collection = "knowledge"
        self.closed = False
        with self._registry_lock:
            if self.path not in self._registry:
                client = QdrantClient(path=self.path)
                self._registry[self.path] = [client, threading.RLock(), 0, dimensions]
            state = self._registry[self.path]
            if state[3] != dimensions:
                raise ValueError("向量维度已变更；请使用新的 DATA_DIR 重建索引")
            state[2] += 1
            self.client, self.lock = state[:2]
        with self.lock:
            if not self.client.collection_exists(self.collection):
                self.client.create_collection(self.collection, vectors_config=models.VectorParams(size=dimensions, distance=models.Distance.COSINE))
            elif self.client.get_collection(self.collection).config.params.vectors.size != dimensions:
                self.close()
                raise ValueError("向量索引维度不兼容；请重建索引")

    @staticmethod
    def point_id(chunk_id):
        return str(uuid.uuid5(uuid.NAMESPACE_URL, "deskpilot:" + chunk_id))

    def upsert(self, chunks_and_vectors):
        if not chunks_and_vectors:
            return
        with self.lock:
            self.client.upsert(self.collection, points=[models.PointStruct(
                id=self.point_id(chunk["id"]), vector=vector,
                payload={"chunk_id": chunk["id"], "document_id": chunk["document_id"], "version": chunk["version"]})
                for chunk, vector in chunks_and_vectors])

    def search(self, vector, allowed_ids, limit=20):
        if not allowed_ids:
            return []
        with self.lock:
            result = self.client.query_points(self.collection, query=vector, limit=limit,
                query_filter=models.Filter(must=[models.HasIdCondition(has_id=[self.point_id(i) for i in allowed_ids])]),
                with_payload=True)
            return [{"id": point.payload["chunk_id"], "score": point.score} for point in result.points]

    def close(self):
        with self._registry_lock:
            if self.closed:
                return
            self.closed = True
            state = self._registry[self.path]
            state[2] -= 1
            if not state[2]:
                with self.lock:
                    self.client.close()
                del self._registry[self.path]
