# AI Group Chat

A group chat with several AI characters, each with its own personality and its own model. You write a message, and the characters answer one after another, reacting to you and to each other.

Open it: **Games → AI Group Chat**, or <https://hkarn.github.io/LLM-PlayGround/#games/group-chat>. It is a working prototype. Inside it, the title at the top is a drop-down to switch to another game straight away, and **←** goes back to the list; this header stays at the top while you scroll.

## Before you start

You need an API key, loaded in the connection panel at the top. Any provider with chat models works.

## Chatting

- **Write a message** and press **Send** (or Enter; Shift+Enter makes a new line). Each ticked character then answers once, in turn. That is one round.
- **Another round** lets the characters talk again without a new message from you. Pressing it with an empty chat lets them open the conversation.
- **Stop** cancels the answer being written and ends the round.
- The line under the chat shows who answers in this round, in order.
- **×** next to a message deletes it, so the characters forget it in later rounds.

If a character's answer fails (a wrong model id, or a missing or refused key), it shows the reason in red, and the round goes on with the next character. **↻** next to a failed answer asks that character again, with its current model, about the chat up to that point; the new answer takes the failed one's place.

## Characters

Three example characters are ready: Ada the curious scientist, Bram the grumpy pirate and Cleo the cheerful quiz host.

- **Tick** a character to have it answer each round; untick to leave it out for now.
- **✎** edits a character: its **Name**, its **Personality** (who they are and how they talk), its **Model**, and its **Colour**. Press **Done** to save, or **Remove** to delete it.
- **+ Add character** adds a new one, up to eight.

The **Model** field suggests the chat models loaded from your provider. Click it to see them all, listed by model name with the maker after it, even when a model is already filled in; type part of a name, such as `haiku` or `qwen`, to narrow the list. Give characters different models to see how they compare. A character without a model uses the **Default model** from the chat settings.

Model ids differ between providers (for example `qwen/…` on OpenRouter but `alibaba/…` on Requesty). If you switch provider, check each character's model.

## Chat settings

The **⚙ Chat settings** bar sits above the chat. It's open on your first visit; click it to fold or open it, and it stays the way you left it. Folded, it still shows your name, the turn order and the default model.

| Setting | What it does |
| --- | --- |
| Your name | What the characters call you |
| Default model | Used by every character that has no model of its own |
| Turn order | **Random** shuffles who speaks each round; **List order** follows the character list; **Decision model** lets a decision model pick who talks next (see below) |
| Decision model | Only with the Decision model turn order: the model that picks who talks next. Click it to see your provider's decision models. Kept per provider |
| Max tokens per answer | Keeps answers short (300 by default) |
| Temperature | Higher is more playful and surprising (0.9 by default) |
| About you | What the characters know about you, such as "a sailor who just came home"; they see it after your name. Empty means they only know you as "a human" |
| Setting (shared by everyone) | The situation every character knows, such as "A relaxed group chat between friends" |
| Clear chat | Deletes all messages |
| Reset characters | Puts the three example characters back |

## Decision model turn order

With **Turn order: Decision model**, each round starts with a quick question to a decision model: "Who should talk next in this conversation?" It reads the chat so far (your messages too, and the setting) and gives each ticked character a probability, using their personalities as the options. The round then goes from the most likely character to the least likely, and the line under the chat shows each one's percentage.

- **You are never one of the options.** You decide yourself whether to talk (**Send**) or pass (**Another round**).
- **When you pass,** whoever spoke last is left out of the question, shown at 0 %, and answers last, so nobody answers themselves.
- **The cost** is tiny: about $0.000002–0.000006 a round with the models below. It's added to the total under the characters, as "turn order".
- **If it fails** (no decision model chosen, a provider without decisions such as Custom, or an error), the round runs in random order, and a message from **System** in the chat says why. The characters never see System messages; delete them with **×** like any other.

Decision models are on OpenRouter and Requesty. On OpenRouter, in one test where you had just asked Bram something, `~perplexity/pplx-decider-flash-latest` gave Bram 92 % and `liquid/d1-ultra` 71 %, while `liquid/d1` leaned the wrong way (Bram 48 %). Start with one of the first two.

## Good to know

- The characters, settings and chat are saved in your browser, so they're still there next time.
- Every answer is a separate request with the whole chat so far, so long chats cost more tokens per answer.
