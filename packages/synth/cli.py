"""synth: the synthetic data generator, loaders and playback (Data Spec section 7.4).

  synth ddl                         write infra/snowflake/ddl.sql
  synth load --target duckdb|snowflake [--reset-account]
  synth migrate                     create the app schema in Postgres
  synth seed-app                    users, rules, calendar and email templates
  synth play --until Q11            drive the demo story to a step (Q1..Q22, M1..M6)
  synth reset [--until Q0] [--target duckdb|snowflake]
                                    drop and reload everything, optionally play to a step
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from sqlalchemy import text

from domain.config import settings
from domain.db import get_engine, session_scope
from domain.models import Base


def migrate(drop: bool = False) -> None:
    eng = get_engine()
    with eng.begin() as con:
        con.execute(text("create extension if not exists vector"))
        if drop:
            con.execute(text("drop schema public cascade"))
            con.execute(text("create schema public"))
            con.execute(text("create extension if not exists vector"))
    Base.metadata.create_all(eng)


def clear_objects() -> None:
    root = Path(settings.object_store_root)
    if root.exists():
        # Delete files; empty folders may be locked by a sync client (OneDrive), which is harmless.
        for f in sorted(root.rglob("*"), reverse=True):
            try:
                f.unlink() if f.is_file() else f.rmdir()
            except OSError:
                pass
        shutil.rmtree(root, ignore_errors=True)
    import connectors.object_store as os_mod

    os_mod._store = None


def reset(target: str = "duckdb", until: str | None = None, log=print, reset_account: bool = False) -> None:
    from synth import generator, loader, seed_app

    # The warehouse load is the slow part (about a minute on Snowflake), so it runs first while the app keeps its
    # tables; the app schema is then dropped and rebuilt in a couple of seconds.
    loader.write_ddl_file()
    loader.load(target, reset_account=reset_account, log=lambda m: None)
    log(f"warehouse loaded ({target})")
    migrate(drop=True)
    clear_objects()
    with session_scope() as s:
        log(f"app seeded: {seed_app.seed(s)}")
        if not until or until.upper() == "Q0":
            # Live demo (decision D23): every loan except Harbor keeps up by itself as the clock moves.
            # A scripted play drives every loan itself, so it starts with autofill off.
            from synth import autopilot

            autopilot.set_setting(s, ["F-0002"])
    generator.write_ground_truth()
    if until and until.upper() != "Q0":
        from synth.play import play

        play(until, log)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="synth")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ddl")
    lp = sub.add_parser("load")
    lp.add_argument("--target", default=settings.warehouse, choices=["duckdb", "snowflake"])
    lp.add_argument("--reset-account", action="store_true", help="drop every other user database first (Snowflake)")
    sub.add_parser("migrate")
    sub.add_parser("seed-app")
    pp = sub.add_parser("play")
    pp.add_argument("--until", default="Q22")
    rp = sub.add_parser("reset")
    rp.add_argument("--until", default="Q0")
    rp.add_argument("--target", default=settings.warehouse, choices=["duckdb", "snowflake"])
    rp.add_argument("--reset-account", action="store_true")
    a = p.parse_args(argv)
    from synth import loader, seed_app

    if a.cmd == "ddl":
        print(loader.write_ddl_file())
    elif a.cmd == "load":
        print(loader.load(a.target, reset_account=a.reset_account))
    elif a.cmd == "migrate":
        migrate()
    elif a.cmd == "seed-app":
        migrate()
        with session_scope() as s:
            print(seed_app.seed(s))
    elif a.cmd == "play":
        from synth.play import play

        play(a.until)
    elif a.cmd == "reset":
        reset(a.target, a.until, reset_account=a.reset_account)
    return 0


if __name__ == "__main__":
    sys.exit(main())
