# Who it’s for

## Teams shipping LLM agents

Kyklos fits when you need **repeatable pipelines** around an agent: run a **dataset**, apply **judges** and **safety** checks, enforce **latency/cost** bounds, and **gate** promotion — with a **single run record** (logs, scores, artifacts) you can compare across commits.

## Platform and ML engineers

You get a **self-hosted** control plane: **YAML-defined** workflows, **REST API**, and a **dashboard** for triggers and inspection — without building a custom runner from scratch.

## What it’s not

Kyklos is **not** a hosted model API, a vector database, or a Kubernetes operator. It **orchestrates** your **steps** (Python) and **records** outcomes. You bring models, data, and infrastructure; Kyklos coordinates **how** they run and **what** “passing” means.

## Compared to generic CI

Generic CI runs jobs and exits. Kyklos is **opinionated about agent workflows**: structured **scores**, **`pass_if`** gates, **eval bundle fingerprints**, **run comparison**, and **artifact** lineage — so “green” means something you can **audit**.
