---
name: measure-world
description: Report a world's file sizes by kind and how long its plates, platters and caves take to read, and list files that don't decode. Use for format or load-time work, or to check a converted world.
---

# Measure a world

```sh
node .agents/skills/measure-world/measure.mjs tmp/worlds/northvale.zip
```

It takes a zip or a folder, and prints a row for each kind of file: count, total size, largest file, and read time for the kinds it decodes. It exits with 1 if any file fails to decode, and lists those.
