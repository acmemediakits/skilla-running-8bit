# Local Game Fonts

Drop project-ready webfonts here when a game needs locally hosted typography.

Recommended formats:

- `.woff2` for production-ready browser delivery
- `.woff` only when a client asset package does not include `.woff2`

The dashboard Theme panel documents this folder and the Python exporter copies it into each standalone `games/{project-name}` package. Future authoring UI can scan this folder and expose discovered families as selectable local fonts.
