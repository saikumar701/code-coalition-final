import { RemoteUser } from "@/types/user"
import { StateField, StateEffect, Transaction } from "@codemirror/state"
import {
    EditorView,
    Decoration,
    DecorationSet,
    WidgetType
} from "@codemirror/view"

/* ------------------ Effects ------------------ */

export const updateRemoteUsers = StateEffect.define<RemoteUser[]>()

/* ------------------ Utils ------------------ */

function getUserColor(username: string): string {
    const colors = [
        "#FF0000",
        "#008080",
        "#0000FF",
        "#008000",
        "#FFD700",
        "#800080",
        "#00CED1",
        "#FFA500",
        "#9932CC",
        "#1E90FF",
    ]

    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash)
    }

    return colors[Math.abs(hash) % colors.length]
}

/* ------------------ Cursor Widget ------------------ */

class CursorWidget extends WidgetType {
    constructor(private user: RemoteUser) {
        super()
    }

    eq(other: CursorWidget) {
        return (
            this.user.username === other.user.username &&
            this.user.typing === other.user.typing
        )
    }

    toDOM() {
        const color = getUserColor(this.user.username)

        const cursor = document.createElement("span")
        cursor.className = "cm-remote-cursor"
        cursor.style.cssText = `
            position: absolute;
            width: 2px;
            height: 1.2em;
            background-color: ${color};
            border-radius: 1px;
            pointer-events: none;
            z-index: 10;
            animation: cursor-blink 1s infinite;
        `

        const label = document.createElement("span")
        label.className = "cm-remote-cursor-label"
        label.textContent = this.user.username
        label.style.cssText = `
            position: absolute;
            top: -20px;
            left: 0;
            background-color: ${color};
            color: randomColor();
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            white-space: nowrap;
            pointer-events: none;
            opacity: ${this.user.typing ? "1" : "0.7"};
        `

        cursor.appendChild(label)
        return cursor
    }
}

/* ------------------ Decorations ------------------ */

function createCursorDecoration(user: RemoteUser, pos: number) {
    return Decoration.widget({
        widget: new CursorWidget(user),
        side: 1,
    }).range(pos)
}

function createSelectionDecoration(user: RemoteUser, from: number, to: number) {
    const color = getUserColor(user.username)

    return Decoration.mark({
        attributes: {
            style: `
                background-color: ${color}33;
                border-left: 2px solid ${color};
            `,
        },
    }).range(from, to)
}

/* ------------------ State Field ------------------ */

export const remoteUsersField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none
    },

    update(decorations: DecorationSet, tr: Transaction): DecorationSet {
        decorations = decorations.map(tr.changes)

        let nextDecorations: DecorationSet | null = null

        for (const effect of tr.effects) {
            if (effect.is(updateRemoteUsers)) {
                const users = effect.value
                const ranges: any[] = []

                for (const user of users) {
                    if (
                        !user.typing &&
                        user.selectionStart === undefined &&
                        user.selectionEnd === undefined
                    ) {
                        continue
                    }

                    if (
                        user.selectionStart !== undefined &&
                        user.selectionEnd !== undefined &&
                        user.selectionStart !== user.selectionEnd
                    ) {
                        const from = Math.min(user.selectionStart, tr.newDoc.length)
                        const to = Math.min(user.selectionEnd, tr.newDoc.length)
                        if (from < to) {
                            ranges.push(createSelectionDecoration(user, from, to))
                        }
                    }

                    if (typeof user.cursorPosition === "number") {
                        const pos = Math.min(user.cursorPosition, tr.newDoc.length)
                        ranges.push(createCursorDecoration(user, pos))
                    }
                }

                nextDecorations = Decoration.set(ranges, true)
            }
        }

        return nextDecorations ?? decorations
    },

    provide: (field: StateField<DecorationSet>) =>
        EditorView.decorations.from(field),
})

/* ------------------ Theme ------------------ */

export const remoteUserTheme = EditorView.baseTheme({
    ".cm-remote-cursor": {
        position: "relative",
        display: "inline-block",
    },

    "@keyframes cursor-blink": {
        "0%, 50%": { opacity: "1" },
        "51%, 100%": { opacity: "0" },
    },
})

/* ------------------ Extension ------------------ */

export function collaborativeHighlighting() {
    return [remoteUsersField, remoteUserTheme]
}