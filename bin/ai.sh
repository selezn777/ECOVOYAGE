#!/bin/bash
# ATLAS Orchestrator — делегирует задачи Claude Sonnet
# Использование: ./bin/ai.sh "задача"

TASK="$1"
if [ -z "$TASK" ]; then
  echo "Использование: ./bin/ai.sh \"Описание задачи\""
  exit 1
fi

echo "🚀 ATLAS: передаю задачу Claude Sonnet..."

PROMPT="<context>
$(cat docs/brain/projects.base.md)
</context>

<task>
$TASK
</task>

<output_format>
Следуй циклу EPIC. После завершения: обнови docs/brain/projects.base.md и запусти git add . && git commit -am \"feat: задача\".
</output_format>"

claude --dangerously-skip-permissions -p "$PROMPT"

echo "✅ Соннет завершил. Синхронизирую Second Brain..."
bash ~/Documents/SecondBrain/sync.sh

