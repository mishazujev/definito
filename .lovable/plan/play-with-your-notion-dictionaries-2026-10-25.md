# Play with your Notion dictionaries

## What you get
- On the start screen, a new "Source" choice: **Built-in**, **My Notion**, or **Both**.
- Every game pulls the latest words from your Notion tables, so edits made in Notion show up in the next game.
- One Notion table for each language. Each row's **Name** becomes the word and its **definition** becomes the clue.
- When both sources are picked, your Notion words are mixed into the built-in lists.

## How hints work for Notion words
Your tables have no hint column or word type. For Notion words:
- **Hint** shows the letter blanks with the same definition. There is no longer clue.
- The card has a neutral colour instead of blue, red or green.
- If you later add "Type" or "Hint" columns, the game can use them.

## Steps
1. Connect your Notion account. A card will appear in chat. Share the five dictionary pages with it.
2. Match each table to its language. I'll list the tables I can see and ask you which is which.
3. Add the Source choice and load the words when a game starts. If Notion can't be reached, the game falls back to the built-in words and tells you.

## Technical details
- Standard Notion app connector (one builder connection), called through a server function in `src/lib/notion.functions.ts` (Notion-Version 2025-09-03).
- The function reads the database, gets its data source, and queries it with pagination. It maps the `Name` title and `definition` rich text to Entry rows with `pos: "other"`.
- The language-to-database-ID map is stored in a small config file.
- Add `"other"` to the Pos type and give it a neutral token colour.
- No AI is used, so no credits are spent. Each game makes a few Notion requests.
