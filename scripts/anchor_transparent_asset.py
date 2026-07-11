#!/usr/bin/env python3
"""Move a transparent asset to a stable bottom anchor without resizing it.

Generated building art often contains accidental transparent space beneath the
subject.  This utility preserves the canvas size and every source pixel while
moving the visible alpha bounds to a requested bottom padding.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--bottom-pad", type=int, default=8)
    parser.add_argument("--alpha-threshold", type=int, default=10)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    alpha = source.getchannel("A")
    box = alpha.point(
        lambda value: 255 if value > args.alpha_threshold else 0
    ).getbbox()
    if box is None:
        raise ValueError("No visible pixels found")

    left, top, right, bottom = box
    shift_y = source.height - args.bottom_pad - bottom
    if top + shift_y < 0:
        raise ValueError("Requested bottom anchor would crop the asset at the top")

    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    output.alpha_composite(source, (0, shift_y))

    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination)
    print(
        f"Moved alpha bounds {box} by y={shift_y}; "
        f"new bottom={bottom + shift_y}, canvas={source.size}"
    )
    print(f"Wrote {destination}")


if __name__ == "__main__":
    main()
