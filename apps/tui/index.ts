#!/usr/bin/env bun
import blessed from 'blessed';
import store from '@stina/store';

const screen = blessed.screen({ smartCSR: true, title: 'Stina TUI' });

const box = blessed.box({
  top: 'center',
  left: 'center',
  width: '60%',
  height: '50%',
  content: 'Hello world – Stina',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } },
});

const counter = blessed.text({
  top: 3,
  left: 2,
  content: 'Count: 0',
});

const hint = blessed.text({
  top: 5,
  left: 2,
  content: 'Press [space] or [+] to add, [q] to quit',
});

box.append(counter);
box.append(hint);
screen.append(box);

function renderCount(c: number) {
  counter.setContent(`Count: ${c}`);
  screen.render();
}

store.subscribe(renderCount);

screen.key(['q', 'C-c', 'escape'], () => process.exit(0));
screen.key(['space', '+', 'a'], async () => {
  await store.increment(1);
});

screen.render();