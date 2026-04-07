# Eval bundles & fingerprints

## Purpose

When you declare an **`eval_bundle`** in `kyklos.yaml`, Kyklos can resolve the referenced **prompt**, **dataset**, **rubric**, **schema**, and **model** (per your config) and compute an **`eval_bundle_fingerprint`** stored on each **run**.

## Why it matters

That fingerprint is **traceability**: for a given run you can show **which** eval inputs and model choice were pinned — not just “the pipeline passed,” but **what configuration** produced the scores.

## Practical use

- Compare runs knowing whether the **same bundle** was used.
- Align release decisions with **immutable** eval definitions rather than loose file paths alone.

Exact fields and hashing behavior follow the version of Kyklos you run; see the repository schema (`eval_bundle` in config) for details.
