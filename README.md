# Definito

A multilingual word-guessing game powered by Notion.

## Play online

**[Play Definito](https://definito.ti-h-pe-4406.chatgpt.site/)**

This game was built by Misha Zujev

## Notion definition properties

Use `Definition` for the default English definition. For a translated definition, name the property `Definition (xx)`, where `xx` is the lowercase ISO 639-1 language code, such as `Definition (fr)` or `Definition (de)`. The game also recognizes the existing legacy format `xx definition`, including `fr definition`.

English is selected by default. For another game language, Definito uses the first non-empty translation field for that language and falls back to `Definition` when a page has no translation. Mark playable rows with the `In game` checkbox.



- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development


```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
