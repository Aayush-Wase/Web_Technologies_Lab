# ClassForge — UML class diagrams → Java

Design UML class diagrams visually and get compilable Java source generated live.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Features

- **Canvas**: drag classes, marquee/shift multi-select, pan (Space / Hand / middle mouse), zoom (Ctrl+scroll), snap-to-grid, alignment, auto-layout, obstacle-avoiding elbow routing.
- **Types**: class, abstract class, interface, enum — with attributes, methods, static/final/abstract, visibility, enum constants.
- **Relationships**: inheritance, realization, association, aggregation, composition, dependency — labels and multiplicities (`0..*` becomes `List<T>`).
- **Fast connecting**: select a class and drag from a handle; release on empty canvas to create a connected class.
- **Java generation**: packages, imports, constructors (with `super(...)`), getters/setters, `toString`, Javadoc, `@Override` stubs for inherited abstract/interface methods. Live validation (keywords, cycles, single inheritance, …).
- **Export**: Java `.zip` / single `.java`, PNG, SVG, project JSON. Autosaves to the browser; undo/redo.

## Shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `V` / `H` | Select / Hand | `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Del` | Delete | `Ctrl+D` | Duplicate |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste | `Ctrl+A` | Select all |
| `+` / `-` / `1` | Zoom in / out / fit | `Ctrl+J` | Toggle code panel |
| Arrows | Nudge (Shift = 5×) | `Ctrl+S` | Save JSON |
