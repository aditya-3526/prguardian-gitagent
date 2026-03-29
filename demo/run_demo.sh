#!/bin/bash

# PRGuardian Demo — PR #247: The Friday Auth Time Bomb
# =====================================================
# This demo runs PRGuardian against a real synthetic PR that:
#   - Contains a hardcoded Stripe live API key in a test fixture
#   - Introduces a module-scope auth config cache with no TTL
#   - Was submitted on a Friday at 16:47
#
# PRGuardian should issue: DO_NOT_MERGE with risk score 89/100
#
# Usage: bash demo/run_demo.sh
# Requires: ANTHROPIC_API_KEY (or OPENAI_API_KEY) set in environment

set -e

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Colour

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║           🛡️  PRGuardian Demo                        ║${NC}"
echo -e "${BOLD}${CYAN}║      Merge Consequence Intelligence                  ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Scenario:${NC} PR #247 — Optimize mobile token refresh"
echo -e "${BOLD}Files:${NC}    4 changed, 87 lines"
echo -e "${BOLD}Status:${NC}   ✅ CI passing  ✅ 2 senior approvals  ⏰ Friday 16:47"
echo ""
echo -e "${YELLOW}Running PRGuardian analysis...${NC}"
echo ""

# ── Detect adapter from available API keys ───────────────────────────────────
if [ -n "$ANTHROPIC_API_KEY" ]; then
  ADAPTER="claude"
elif [ -n "$OPENAI_API_KEY" ]; then
  ADAPTER="openai"
elif [ -n "$GEMINI_API_KEY" ]; then
  ADAPTER="gemini"
else
  echo -e "${RED}Error: No API key found.${NC}"
  echo "Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY"
  exit 1
fi

echo -e "Using adapter: ${CYAN}${ADAPTER}${NC}"
echo ""

# ── Run the agent ─────────────────────────────────────────────────────────────
OUTPUT_FILE="demo/output_$(date +%Y%m%d_%H%M%S).md"

npx gitagent run . \
  --adapter "$ADAPTER" \
  --input demo/sample_pr.json \
  --output "$OUTPUT_FILE"

# ── Display result summary ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Analysis Complete${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

if [ -f "$OUTPUT_FILE" ]; then
  # Extract and highlight the recommendation line
  RECOMMENDATION=$(grep -i "recommendation:" "$OUTPUT_FILE" | head -1 || echo "See output file")
  RISK=$(grep -i "risk score:" "$OUTPUT_FILE" | head -1 || echo "")
  
  if echo "$RECOMMENDATION" | grep -qi "DO_NOT_MERGE"; then
    echo -e "${RED}${BOLD}⛔  $RECOMMENDATION${NC}"
  elif echo "$RECOMMENDATION" | grep -qi "MERGE_WITH_CONDITIONS"; then
    echo -e "${YELLOW}${BOLD}⚠️   $RECOMMENDATION${NC}"
  else
    echo -e "${GREEN}${BOLD}✅  $RECOMMENDATION${NC}"
  fi
  
  [ -n "$RISK" ] && echo -e "${BOLD}$RISK${NC}"
  echo ""
  echo -e "Full merge brief saved to: ${CYAN}$OUTPUT_FILE${NC}"
  echo ""
  echo -e "View it now with: ${CYAN}cat $OUTPUT_FILE${NC}"
else
  echo -e "${YELLOW}Output was printed to console above.${NC}"
fi

echo ""
