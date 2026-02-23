# Provenance

Mimir began as the control-plane component of the [Sindri](https://github.com/pacphi/sindri) project. As Sindri's fleet-management capabilities matured into a distinct product with its own lifecycle, deployment model, and user surface, mimir was established as an independent repository to give it the focused identity it deserves.

## Lineage

|                       |                                                   |
| --------------------- | ------------------------------------------------- |
| **Parent project**    | [pacphi/sindri](https://github.com/pacphi/sindri) |
| **Original path**     | `v3/console/` (apps, shared packages)             |
| **Reference commits** | `1c2170f6..f049cd6`                               |
| **Established**       | 2026-02-23                                        |

## Ecosystem

Mimir is one of three complementary projects:

| Repository                                     | Role                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [sindri](https://github.com/pacphi/sindri)     | CLI tool and extension ecosystem — provisions and configures instances                          |
| **mimir** (this repo)                          | Fleet management control plane — orchestrates, observes, and administers instances at scale     |
| [draupnir](https://github.com/pacphi/draupnir) | Lightweight per-instance agent — bridges each instance to the mimir control plane via WebSocket |
