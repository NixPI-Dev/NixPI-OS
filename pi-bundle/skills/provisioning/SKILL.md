---
name: provisioning
description: Provision and bootstrap NixPI on a fresh or existing NixOS host with recovery-aware guardrails
---

# Provisioning Skill

Use this skill when the task is to install a host, bootstrap a machine, or recover a failed onboarding.

## Principles

1. Install a plain host first
2. Preserve console recovery access
3. Bootstrap deliberately
4. Verify SSH, firewall, and operator access before calling the host ready

## Verification Checklist

- `systemctl is-active sshd`
- `sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowtcpforwarding|allowagentforwarding'`
- firewall rules allow the intended admin path
- the operator can rebuild the host again from `~/NixPI/config#<host>`

## Safety Rules

- Never leave the host without a recovery path
- Prefer explicit verification over assumption
- Keep bootstrap-specific guidance separate from steady-state operations
