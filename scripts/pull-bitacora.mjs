# .github/workflows/bitacora-sync.yml
name: Sync Bitacora from SharePoint

on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      # No hace falta msal-node para client credentials
      # - name: Install deps
      #   run: npm i

      - name: Pull from Graph and build JSON
        env:
          AZURE_TENANT_ID:     ${{ secrets.TENANT_ID }}
          AZURE_CLIENT_ID:     ${{ secrets.CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.CLIENT_SECRET }}
          BITACORA_SITE_ID:    ${{ secrets.SITE_ID }}
          BITACORA_LIST_ID:    ${{ secrets.LIST_ID }}
          BITACORA_OUT_DIR:    data
        run: node scripts/pull-bitacora.mjs

      - name: Commit JSON/CSV
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/bitacora.json data/bitacora.csv
          git commit -m "chore: update bitacora feed" || echo "no changes"
          git push
