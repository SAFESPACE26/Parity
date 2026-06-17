# Parity — Functional Specification

This document defines what Parity must do and how it is expected to behave. It is the companion to the design spec (which covers look and feel) and the build prompt (which covers implementation). Where this spec and the build prompt differ on a detail, this spec defines the intended behavior and the build prompt defines how to construct it.

---

## 1. Purpose and scope

Parity verifies that an AI-migrated program behaves identically to the legacy program it was migrated from. It does this empirically: it runs both programs against the same generated inputs, compares their outputs, localizes and explains any divergence, records all evidence in an auditable ledger, and issues a CERTIFIED or NOT CERTIFIED verdict.

In scope for this version: a single-user web application that verifies one legacy/migrated program pair per project. A reviewer uploads the legacy codebase and its migrated counterpart (individual files or an archive) and declares a **comparison contract** — how Parity drives both programs and reads their results. Parity executes both sides inside an isolated **sandbox**, never in the web layer. A built-in COBOL→Python demonstration ships preconfigured. Evidence lives in a live ledger backed by Amazon Aurora PostgreSQL, and the results experience is one an audit or engineering reviewer can act on.

The first-version comparison contract is **black-box**: each program reads the same generated inputs and writes a set of named output fields, which Parity diffs against the oracle. Function-level and HTTP-service contracts are on the roadmap (§10).

The product's promise is **trustworthy independence**: Parity is not the tool that produced the migration, so its verdict can be relied upon as a neutral check.

## 2. Actors

- **Reviewer (primary user):** a risk/audit or engineering reviewer who initiates a verification, reads the verdict, inspects the evidence, and is accountable for accepting or rejecting the migration. Needs confidence, traceability, and clarity.
- **Verification engine (system actor):** the background worker that executes the verification pipeline and writes evidence. Not a human; defines the system's autonomous behavior.

This version has no multi-tenant accounts, roles, or permissions; those are out of scope.

## 3. Domain concepts (glossary)

- **Project:** a legacy program paired with its migrated counterpart, plus the languages of each and the comparison contract. The unit of work.
- **Comparison contract:** the declared way Parity drives both programs and reads comparable results — for the black-box contract, the input schema (fields generated for both sides), the compared output fields, and the run command executed inside each sandbox. The contract is what makes two arbitrary codebases comparable.
- **Sandbox:** the isolated, ephemeral environment in which each uploaded program is compiled and run — no network egress, capped memory and wall-time, throwaway filesystem. Untrusted uploaded code never runs in the web layer.
- **Module:** a logical unit of behavior within the program whose outputs are checked (e.g., `interest_calc`, `payroll`). Findings and divergences are attributed to modules.
- **Verification run:** a single execution of the pipeline for a project, producing evidence and a verdict. A project can have many runs over time.
- **Oracle:** the legacy program's behavior, treated as the source of truth. Equivalence means "matches the oracle."
- **Test case:** one generated input set, executed against both programs.
- **Equivalence relation:** the configurable rule set deciding whether two field values count as equal — per-field tolerance and which fields are masked as legitimately variable.
- **Field diff:** the comparison record for one field of one test case: both values, whether they match, and the numeric delta where applicable.
- **Finding:** an aggregated divergence for one field across a run — how often it diverges, the worst delta, a severity, and a plain-language explanation with a suggested fix.
- **Certification:** the run's verdict and its supporting summary — the artifact a reviewer relies on.
- **Ledger:** the complete, queryable body of evidence (test cases, executions, field diffs, findings, certifications) for every run.

## 4. Functional requirements

### 4.1 Project setup

- The system shall let a reviewer create a project by either selecting the built-in example or uploading a legacy codebase and a migrated codebase. Each side accepts one or more source files (or an archive for a whole codebase) and the language of that side.
- The system shall provide a one-click built-in example (COBOL Interest & Payroll) that is preconfigured and known to contain a genuine divergence, so the product can be evaluated end to end without supplying code.
- The system shall record the project's source and target languages and associate its modules.
- The system shall not execute any uploaded code at upload time; uploaded sources are stored as project artifacts and only run later, inside the sandbox, during a verification run.

### 4.1a Comparison contract

- The system shall let a reviewer declare a comparison contract that makes the two codebases comparable. For the black-box contract this is: the input schema (the fields generated for both sides), the ordered set of compared output fields, and the run command for each side.
- The system shall prefill a sensible contract for the built-in example and require the reviewer to confirm or supply one for an uploaded pair.
- The system shall generate inputs against the declared input schema and diff exactly the declared output fields, attributing each output field to a module.

### 4.2 Initiating a verification run

- The system shall let a reviewer start a verification run for a project, optionally setting the number of inputs (default 10,000) and the equivalence tolerance (default exact).
- The system shall create the run in a queued state and return immediately; the reviewer shall not have to wait synchronously for execution.
- The system shall execute runs asynchronously in the verification engine, independent of the web request.
- The system shall reflect run progress to the reviewer in near real time, including which stage is executing and how many inputs have been processed.

### 4.3 Input generation

- The system shall generate the requested number of input cases spanning a realistic range for each input field.
- The system shall additionally include boundary cases deliberately chosen to exercise rounding and edge behavior, so that subtle divergences are reliably surfaced rather than missed by chance.
- The system shall persist every generated input case so that any later verdict is traceable to the exact inputs that produced it.

### 4.4 Execution (sandboxed)

- The system shall execute each side inside an isolated sandbox using the contract's run command, and treat the legacy program's output as the oracle.
- The system shall execute the migrated program against the identical inputs, in its own sandbox.
- The system shall isolate every sandbox: no outbound network, capped memory and wall-clock time, and an ephemeral filesystem discarded after the run. A program that exceeds its limits is recorded as a failure for the affected cases.
- The system shall run uploaded code only in the background verification engine, never in the web request path.
- The system shall run the demonstration without requiring a mainframe, using a COBOL runtime that runs on commodity infrastructure within the sandbox.
- The system shall record each program's output for each input case, with execution timing.
- If a program fails to execute on an input, the system shall record the failure for that case and continue; a single failing case shall not abort the whole run.

### 4.5 Equivalence and comparison

- The system shall compare the two programs' outputs **field by field**, not only on final results, so divergences inside intermediate calculations are caught.
- The system shall apply a configurable equivalence relation: a per-field tolerance (default exact, comparing monetary values to the cent) and a set of masked fields treated as legitimately variable.
- The system shall neutralize non-deterministic values (such as timestamps or sequence numbers) identically on both sides before comparison, so that legitimate variability does not produce false divergences.
- The system shall compute, for each compared field of each case, whether the values match and the numeric delta where applicable, and persist this as evidence.
- The system shall attribute each divergence to the responsible module and field.

### 4.6 Findings and explanation

- The system shall aggregate divergences per field into a finding that reports the divergence rate (diverging cases over total), the maximum absolute delta, and a severity.
- The system shall generate, for each finding, a plain-language explanation of the most likely root cause and a concrete suggested fix, derived from representative diverging cases.
- The explanation shall be specific enough to be actionable (identifying, for example, a rounding-mode or numeric-type cause) rather than generic.

### 4.7 Certification

- The system shall issue exactly one verdict per completed run: CERTIFIED if no field diverges beyond tolerance, NOT CERTIFIED if any field does.
- The certification shall record the inputs verified, the fields checked, the number of findings, and a coverage summary.
- A certification, once issued for a run, shall be immutable; re-verification produces a new run and a new certification rather than altering a prior one. This preserves the audit trail.

### 4.8 Ledger and auditability

- The system shall retain the full evidence chain for every run — inputs, both executions, every field comparison, findings, and the certification — and make it queryable.
- The system shall allow a reviewer to reconstruct any verdict by drilling from the certification to the specific field and the exact input case that caused a divergence.
- The system shall present evidence as records the reviewer can filter and inspect, including a view that isolates only diverging cases.

### 4.9 Analytics

- The system shall present, for a run, the divergence rate per field and overall coverage.
- The system shall present, for a project, how divergence has changed across successive runs (drift over time), so a reviewer can see a migration improving toward certification.
- These analytics shall be computed from the ledger itself, so they always reflect the actual recorded evidence.

## 5. Primary user flows

### 5.1 Verify the built-in example (the core flow)

1. The reviewer opens Parity and chooses **New verification**.
2. They select the built-in COBOL Interest & Payroll example and start the run with defaults.
3. The run page shows live progress as inputs are generated and both programs execute.
4. On completion, the reviewer sees a **NOT CERTIFIED** verdict with a one-line summary, a finding on the diverging field, an explanation identifying the rounding cause, and a suggested fix.
5. The reviewer opens the diff explorer, filters to diverging cases, and inspects the exact inputs and the legacy-vs-migrated values that broke.

### 5.2 Verify a supplied migration

1. The reviewer creates a project by uploading the legacy codebase and the migrated codebase and selecting the language of each.
2. They confirm the comparison contract — input schema, compared output fields, and the run command for each side (prefilled defaults can be edited).
3. They run verification; the system generates inputs, runs both sides in isolated sandboxes, compares the declared output fields, and issues a verdict.
4. The reviewer reads the verdict and evidence as above.

### 5.3 Re-verify after a fix

1. After applying the suggested fix, the reviewer re-runs verification on the project.
2. The system produces a new run; if the fix resolves the divergence, the new run is CERTIFIED.
3. The project's drift-over-time view shows divergence dropping across the two runs, and both certifications remain in the ledger.

## 6. Business rules

- **Verdict rule:** a run is NOT CERTIFIED if and only if at least one field diverges beyond its tolerance on at least one input case; otherwise CERTIFIED.
- **Tolerance:** default is exact (monetary values compared to the cent). A field may be configured with a tolerance, within which differences are treated as matches. A masked field is excluded from the verdict entirely.
- **Severity:** a divergence on a monetary field is treated as critical because its consequences are financial; severity otherwise scales with divergence rate and delta magnitude. Severity informs presentation and prioritization but does not change the binary verdict — any uncovered divergence prevents certification.
- **Oracle authority:** the legacy program is always the reference. "Correct" means "matches the legacy output," not "matches an external specification."
- **Immutable evidence:** runs and certifications are append-only. Nothing about a completed run is edited after the fact; new information means a new run.
- **Independence:** Parity verifies a migration regardless of which tool produced it; the verdict does not depend on, and is not influenced by, the migration's provenance.

## 7. Run lifecycle (state machine)

- **Queued:** created by a reviewer's request; awaiting the engine.
- **Running:** claimed by the engine; the pipeline is executing. Progress is observable.
- **Completed:** the pipeline finished; a verdict and full evidence exist.
- **Failed:** the pipeline could not finish (for example, the legacy program would not compile, or the environment is missing a runtime); the failure reason is recorded and surfaced to the reviewer.

A run moves Queued → Running → Completed, or Queued → Running → Failed. A run never returns to a prior state; recovery is a new run.

## 8. Edge cases and error handling

- **Migrated program errors on some inputs:** record those cases as execution failures, continue the run, and reflect them in the result rather than aborting. A program that errors broadly should be surfaced clearly (the migration is not certifiable if it cannot run).
- **Legacy program will not compile or run:** the run fails with a clear, actionable reason; the reviewer is told what to correct.
- **No divergences found:** the run is CERTIFIED; the result is presented as a confident pass with full coverage, and the evidence remains inspectable so that a pass is still auditable.
- **Identical-looking values that differ in precision:** because comparison is exact by default and to full precision, sub-cent divergences are caught and surfaced rather than hidden by rounding in the display.
- **Empty or filtered evidence views:** present direction ("no divergences in this field; every input matched the oracle") rather than a blank state.
- **Long-running verification:** the reviewer is never left with an ambiguous spinner; progress and stage are always visible, and a failure is always explained.

## 9. Non-functional expectations

- **Determinism:** the built-in example must produce the same divergent result on every run, so demonstrations and audits are repeatable.
- **Traceability:** every verdict must be fully reconstructable from stored evidence; no conclusion may rest on data the ledger does not contain.
- **Separation of execution:** verification execution runs in the background engine, not inside the web layer, so that heavy workloads do not constrain or destabilize the application.
- **Sandbox isolation:** uploaded code is untrusted and runs only in an isolated sandbox — no network egress, capped memory and wall-time, ephemeral filesystem, and no access to other projects' artifacts or to Parity's own credentials. A misbehaving or malicious upload can degrade only its own run.
- **Integrity of the record:** the ledger is the system of record; analytics and verdicts are derived from it rather than computed and discarded.
- **Clarity over cleverness:** results, findings, and errors are stated plainly and specifically; the reviewer should never have to interpret ambiguous output.
- **Responsiveness:** progress updates and result views should feel immediate; the reviewer should perceive the system as live throughout a run.

## 10. Out of scope (this version)

- Multi-user accounts, roles, permissions, or organizations.
- Replaying real production traffic as inputs (reserved for a later version).
- Comparison contracts beyond black-box: function-level (declared entrypoint + typed input generation) and HTTP-service (replayed requests, diffed responses) are on the roadmap.
- Cross-tool certification across multiple migration tools to a single standard (roadmap).
- Integration with external CI/CD or audit-governance systems.
- Verification of full mainframe systems with live external resources (databases, transaction middleware) beyond the self-contained demonstration scope.

## 11. Acceptance criteria

- A reviewer can verify the built-in example end to end and receive a NOT CERTIFIED verdict, reliably, on every run.
- The verdict is accompanied by at least one finding localized to the diverging field, with an explanation that names the actual cause and a concrete suggested fix.
- The reviewer can inspect the exact inputs and the legacy-vs-migrated values behind any divergence, and can reconstruct the verdict from the evidence.
- Re-verifying a corrected migration yields a CERTIFIED verdict, and both runs remain in the ledger with divergence shown decreasing over time.
- All evidence persists in the ledger and all analytics are derived from it; nothing essential to a verdict exists only transiently.
- Verification execution occurs outside the web request path, and run progress and failures are always clearly communicated to the reviewer.
