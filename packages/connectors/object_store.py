"""Object store connector: simulated Box, SharePoint, OneDrive and the uploads bucket.

The POC keeps one folder per bucket (Data Spec section 3.1 layouts). A MinIO or Box
or Graph implementation replaces LocalObjectStore by configuration only.
"""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from pathlib import Path

from domain.config import settings

BUCKETS = ["box", "sharepoint", "onedrive", "uploads", "mail"]


class ObjectStore(ABC):
    @abstractmethod
    def put(self, bucket: str, key: str, data: bytes) -> str: ...

    @abstractmethod
    def get(self, bucket: str, key: str) -> bytes: ...

    @abstractmethod
    def exists(self, bucket: str, key: str) -> bool: ...

    @abstractmethod
    def list(self, bucket: str, prefix: str = "") -> list[str]: ...


class LocalObjectStore(ObjectStore):
    def __init__(self, root: str | None = None):
        self.root = Path(root or settings.object_store_root)
        for b in BUCKETS:
            (self.root / b).mkdir(parents=True, exist_ok=True)

    def _path(self, bucket: str, key: str) -> Path:
        if bucket not in BUCKETS:
            raise ValueError(f"unknown bucket {bucket}")
        p = (self.root / bucket / key).resolve()
        if not str(p).startswith(str((self.root / bucket).resolve())):
            raise ValueError("path escapes bucket")
        return p

    def put(self, bucket, key, data):
        p = self._path(bucket, key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return hashlib.sha256(data).hexdigest()

    def get(self, bucket, key):
        return self._path(bucket, key).read_bytes()

    def exists(self, bucket, key):
        return self._path(bucket, key).exists()

    def list(self, bucket, prefix=""):
        base = self.root / bucket
        return sorted(str(p.relative_to(base)).replace("\\", "/") for p in base.rglob("*")
                      if p.is_file() and str(p.relative_to(base)).replace("\\", "/").startswith(prefix))

    def health(self) -> dict:
        return {"connector": "object_store", "status": "ok", "root": str(self.root)}


_store: ObjectStore | None = None


def get_store() -> LocalObjectStore:
    global _store
    if _store is None:
        _store = LocalObjectStore()
    return _store  # type: ignore[return-value]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
