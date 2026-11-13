# ulyngalot.github.io

Personal portfolio site, plus two private browser tools.

| Path | What it is | Private |
|---|---|---|
| `/` | The portfolio | no |
| `/md-viewer` | Paste or drop a Markdown file and read it as formatted text | yes |
| `/pdf-editor` | Edit the real text inside a PDF; convert to Word or HTML | yes |

Everything is static. There is no build step: the pages are hand-written
HTML, CSS and vanilla JavaScript, and GitHub Pages serves them as they are.
Editable content lives in `content/*.json`, fetched at load time and merged
over defaults built into the page, so copy can be changed by editing a JSON
file on GitHub without touching any code.
