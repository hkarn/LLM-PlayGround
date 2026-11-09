# AI Group Chat

A group chat with several AI characters, each with its own personality and its own model. You write a message, and the characters answer one after another, reacting to you and to each other.

Open it: **Games → AI Group Chat**, or <https://hkarn.github.io/LLM-PlayGround/#games/group-chat>. It is a working prototype.

## Before you start

You need an API key, loaded in the connection panel at the top. Any provider with chat models works.

## Chatting

- **Write a message** and press **Send** (or Enter; Shift+Enter makes a new line). Each ticked character then answers once, in turn. That is one round.
- **Another round** lets the characters talk again without a new message from you. Pressing it with an empty chat lets them open the conversation.
- **Stop** cancels the answer being written and ends the round.
- The line under the chat shows who answers in this round, in order.
- **×** next to a message deletes it, so the characters forget it in later rounds.

If a character's answer fails (a wrong model id, or a missing or refused key), it shows the reason in red, and the round goes on with the next character.

## Characters

Three example characters are ready: Ada the curious scientist, Bram the grumpy pirate and Cleo the cheerful quiz host.

- **Tick** a character to have it answer each round; untick to leave it out for now.
- **✎** edits a character: its **Name**, its **Personality** (who they are and how they talk), its **Model**, and its **Colour**. Press **Done** to save, or **Remove** to delete it.
- **+ Add character** adds a new one, up to eight.

The **Model** field suggests the chat models loaded from your provider. Give characters different models to see how they compare. A character without a model uses the **Default model** from the chat settings.

Model ids differ between providers (for example `qwen/…` on OpenRouter but `alibaba/…` on Requesty). If you switch provider, check each character's model.

## Chat settings

Open **Chat settings** above the chat:

| Setting | What it does |
| --- | --- |
| Your name | What the characters call you |
| Default model | Used by every character that has no model of its own |
| Turn order | **Random** shuffles who speaks each round; **List order** follows the character list |
| Max tokens per answer | Keeps answers short (300 by default) |
| Temperature | Higher is more playful and surprising (0.9 by default) |
| Setting (shared by everyone) | The situation every character knows, such as "A relaxed group chat between friends" |
| Clear chat | Deletes all messages |
| Reset characters | Puts the three example characters back |

## Good to know

- The characters, settings and chat are saved in your browser, so they're still there next time.
- Every answer is a separate request with the whole chat so far, so long chats cost more tokens per answer.
