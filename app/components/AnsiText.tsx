"use client";

import Anser from "anser";
import { type CSSProperties, type FunctionComponent, useMemo } from "react";

const rgb = (value: string) => (value ? `rgb(${value})` : undefined);

export const AnsiText: FunctionComponent<{ children: string }> = ({
  children,
}) => {
  const chunks = useMemo(
    () => Anser.ansiToJson(children, { remove_empty: true }),
    [children],
  );

  return chunks.map((chunk, index) => {
    const decorations = new Set([
      ...(chunk.decorations ?? []),
      ...(chunk.decoration ? [chunk.decoration] : []),
    ]);
    let color = rgb(chunk.fg_truecolor || chunk.fg);
    let backgroundColor = rgb(chunk.bg_truecolor || chunk.bg);
    if (decorations.has("reverse")) {
      [color, backgroundColor] = [backgroundColor, color];
    }

    const textDecorations = [
      decorations.has("underline") ? "underline" : null,
      decorations.has("strikethrough") ? "line-through" : null,
    ].filter(Boolean);
    const style: CSSProperties = {
      color,
      backgroundColor,
      display: decorations.has("hidden") ? "none" : undefined,
      fontStyle: decorations.has("italic") ? "italic" : undefined,
      fontWeight: decorations.has("bold") ? 700 : undefined,
      opacity: decorations.has("dim") ? 0.65 : undefined,
      textDecoration: textDecorations.join(" ") || undefined,
    };

    return (
      // ANSI chunks have no intrinsic IDs and are immutable presentation-only spans.
      // biome-ignore lint/suspicious/noArrayIndexKey: Order is the chunk identity here.
      <span key={index} style={style}>
        {chunk.content}
      </span>
    );
  });
};
