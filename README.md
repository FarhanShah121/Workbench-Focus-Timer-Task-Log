# Workbench — Focus Timer & Task Log

A Pomodoro timer and to-do list, built with plain HTML, CSS, and JavaScript
(no frameworks, no build step), split into three separate files.

## Features

- 25-minute focus timer with Start / Pause / Resume / Reset
- Automatically switches to a 5-minute break after each focus session, then
  back to a fresh 25-minute session — repeating indefinitely
- A tally of completed focus sessions for the current day
- A task ledger: add tasks, mark them complete, delete them
- Tasks and today's session tally are saved in the browser's `localStorage`,
  so they survive a page refresh
- A screen flash + audio chime when a timer phase ends
- An "Info / Help" tab explaining the Pomodoro technique and how to use the app

## Files

- `index.html` — page markup, links to `style.css` and `script.js`
- `style.css` — all styling (the instrument-panel theme, dial, task ledger)
- `script.js` — timer logic, task ledger logic, localStorage persistence
