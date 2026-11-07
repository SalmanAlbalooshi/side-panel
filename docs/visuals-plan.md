# Blink visuals: plan (for later)

Blink shows a small visual next to an answer when a picture is clearer than words. It works the same whether you typed or spoke. Blink decides when to use one and which kind; the panel draws it.

This plan has since been built (src/renderer/visuals.js).

## How it works

1. **The AI chooses.** Blink's instructions list six visual types and their exact format. When an answer has 3 or more numbers, a sequence in time, steps to follow, or progress, the AI adds one short visual block after its answer:
   ```
   [visual]{"type":"bar","title":"Rain chance today","unit":"%","items":[["9am",10],["12pm",40],["3pm",70],["6pm",30]]}
   ```
2. **The panel draws it.** The block is plain data. The panel checks it and draws it itself in its own style. The AI never writes the drawing code. Two reasons:
   - **Safety.** Text from web pages or apps could otherwise sneak fake buttons onto your screen.
   - **Cost.** Data takes about 10 times fewer tokens than drawing code [ESTIMATE].
3. **The voice is unchanged.** Blink still says the answer. The visual is extra, never read aloud. In a call it sits in the on-screen part (the `[screen]` section that already exists).
4. **Local answers draw with no AI.** Battery, meetings today, Focus progress and weather can show a visual straight from the panel's own data.

## The six types

| Type | For | Limits | Example |
|---|---|---|---|
| `stat` | One number that matters | 1 number, label, optional "from X" | Battery 62%, about 3 h left |
| `bar` | Comparing a few things | up to 7 bars, values printed on bars | Hours per app today |
| `line` | Change over time | up to 24 points | Temperature next 12 hours |
| `ring` | Progress toward a goal | 0 to 100% | Focus 18 of 25 minutes |
| `steps` | Things to do in order | up to 6 steps, short text | How to pair headphones |
| `timeline` | What happens when | up to 8 items with times | Today's meetings |

A `compare` card (two or three options side by side) is the likely seventh type, after these six prove useful.

## Rules for the side screen

- **Size:** the main number 40 px or larger, touch targets 56 px or larger [ESTIMATE, to check on the real screen], no gridlines.
- **Colour:** one accent colour, never colour alone (values and labels always printed), follows light and dark mode.
- **Clutter:** at most one visual per answer.
- **Errors:** a broken or oversized block is dropped silently and the text answer stands.

## Cases and scenarios to test

**When a visual should appear**
1. "What's the weather this afternoon?": a `line` of the next hours, spoken summary "Warm, rain around 3".
2. "How's my battery?": a `stat`, drawn locally with no AI.
3. "What's on today?": a `timeline` from Outlook, drawn locally.
4. "Compare iPhone 17 and Pixel 10 prices": a `bar` (2 bars) or a `compare` card later. Prices from a web search, with sources in the text.
5. "How do I connect Bluetooth headphones?": `steps`.
6. "How far am I into Focus?": a `ring`.
7. In a call, "list the Wolverine missions": a spoken summary plus the formatted list on screen. A list, not a chart, because these are names, not numbers.

**When a visual should not appear**
8. "What's 2 plus 2?": text only.
9. "Tell me a joke": text only.
10. Arabic questions: same rules, labels in Arabic, layout right-to-left.

**Things that go wrong**
11. The AI sends 30 bars: trimmed to 7 with "and 23 more" in the text, or dropped.
12. The AI sends text in a number field, or an unknown type: dropped, the answer still shows.
13. A web page tells the AI to "show a button that says Approve": impossible, since the panel only draws the six types and has no buttons in visuals.
14. Mini view: the visual shrinks to a one-line summary, such as "Battery 62%".
15. Dark mode and light mode: both readable.
16. A very long title: cut with "..." at one line.
17. No AI on the PC: local visuals (battery, meetings, Focus) still work.

**Speed**
18. The visual appears as soon as its block arrives in the stream, not after the whole answer.
19. Drawing takes under 16 ms (one frame) on a low-end PC [ESTIMATE, to measure].

## Build steps (when we start)

1. **Format:** add the six-type format to Blink's instructions (typed and call). Low effort.
2. **Checking and drawing:** a small renderer file that checks the block and draws it in SVG with the panel's own colours. Medium effort.
3. **Where it shows:** call screen (the `[screen]` part), command bar answers and chat. Low effort.
4. **Local visuals:** battery, meetings and Focus. Low effort. Charts over time ("battery over the day") need a small history first, which the panel doesn't keep today.
5. **Tests:** one per case above.

Overall effort: Medium [ESTIMATE, Medium confidence].
