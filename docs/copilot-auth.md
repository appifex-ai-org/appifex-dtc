# GitHub Copilot Authentication

`dtc` uses GitHub Copilot via OAuth Device Flow. This requires a real
GitHub App client ID — the default placeholder `Iv1.dtc_placeholder`
intentionally aborts `dtc setup` with a pointer to this document.

## Why the placeholder aborts

The device-flow endpoint at `https://github.com/login/device/code`
rejects any client ID that is not a registered GitHub App. Shipping a
real client ID in the open-source binary would tie all installs to a
single app registration, which is neither sustainable nor secure.

## Create your own GitHub App

1. Open https://github.com/settings/apps and click **New GitHub App**.
2. Fill in a name (e.g. `my-dtc`), a homepage URL (anything valid —
   `https://github.com/<you>` works), and a callback URL (not used for
   device flow — set to `http://localhost`).
3. Under **Device Flow**, check **Enable Device Flow**.
4. Save. Copy the **Client ID** from the app settings page.

## Export `DTC_GITHUB_CLIENT_ID`

```bash
export DTC_GITHUB_CLIENT_ID="Iv1.abc123yourid"
```

Add this to your shell profile (`~/.zshrc`, `~/.bashrc`) if you want
it to persist.

## Re-run setup

```bash
dtc setup
```

Pick `GitHub Copilot` as the LLM provider. The device-flow spinner
should now load, printing an 8-character user code and a verification
URL.

## Troubleshooting

- If you still see the placeholder abort, confirm the env var is
  exported in the same shell where you run `dtc`:
  `echo $DTC_GITHUB_CLIENT_ID`.
- If the device-flow endpoint returns `slow_down`, wait for the
  back-off to complete — `dtc` handles this automatically per RFC 8628
  §3.5 (see Phase 03 DX-05).
