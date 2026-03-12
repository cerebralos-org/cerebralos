# 메모리 마이그레이션 가이드

이 가이드는 ChatGPT, Claude, Gemini 등의 AI에 축적된 기억을 CerebraLOS로 마이그레이션하는 방법을 설명합니다.

## Step 1: Export Memory from Your Current AI

Send the following prompt to your current AI (ChatGPT, Claude, Gemini, etc.):

```text
Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

Categories (output in this order):
1. Instructions: Rules I've explicitly asked you to follow
2. Identity: Name, age, location, education, family, relationships
3. Career: Current and past roles, companies, skill areas
4. Projects: Projects I meaningfully built or committed to
5. Preferences: Opinions, tastes, working-style preferences

Format each line as: [YYYY-MM-DD] - Entry content here.
Wrap the entire export in a single code block.
```

## Step 2: Import into CerebraLOS

```bash
# Save to file
pbpaste > ~/my_memory.md

# Import
cerebralos import --from ~/my_memory.md --type ai_export
```

## Step 3: Sleep (Memory Consolidation)

```bash
cerebralos sleep
```
