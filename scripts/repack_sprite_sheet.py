#!/usr/bin/env python3
"""Repack an uneven 3x4 walking sheet around stable center/foot anchors.

The image generator can place otherwise valid frames at slightly different
positions.  This utility preserves every source pixel, but moves each frame
onto an exact grid with a shared horizontal center and foot baseline.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def occupied_runs(counts: list[int], minimum: int = 8) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, count in enumerate(counts + [0]):
        if count >= minimum and start is None:
            start = index
        elif count < minimum and start is not None:
            runs.append((start, index - 1))
            start = None
    return runs


def content_box(alpha: Image.Image, bounds: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    left, top, right, bottom = bounds
    crop = alpha.crop(bounds)
    box = crop.point(lambda value: 255 if value > 10 else 0).getbbox()
    if box is None:
        raise ValueError(f"No visible pixels in region {bounds}")
    return left + box[0], top + box[1], left + box[2], top + box[3]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--cols", type=int, default=3)
    parser.add_argument("--rows", type=int, default=4)
    parser.add_argument("--baseline-pad", type=int, default=4)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    alpha = source.getchannel("A")
    width, height = source.size
    pixels = alpha.load()

    x_counts = [sum(1 for y in range(height) if pixels[x, y] > 32) for x in range(width)]
    y_counts = [sum(1 for x in range(width) if pixels[x, y] > 32) for y in range(height)]
    x_runs = occupied_runs(x_counts)
    y_runs = occupied_runs(y_counts)
    if len(x_runs) != args.cols or len(y_runs) != args.rows:
        raise ValueError(
            f"Expected {args.cols} column bands and {args.rows} row bands, "
            f"found {x_runs!r} and {y_runs!r}"
        )

    cell_width = width // args.cols
    cell_height = height // args.rows
    output = Image.new("RGBA", (cell_width * args.cols, cell_height * args.rows), (0, 0, 0, 0))
    baseline = cell_height - args.baseline_pad

    for row, (band_top, band_bottom) in enumerate(y_runs):
        for col, (band_left, band_right) in enumerate(x_runs):
            box = content_box(alpha, (band_left, band_top, band_right + 1, band_bottom + 1))
            frame = source.crop(box)
            x = col * cell_width + (cell_width - frame.width) // 2
            y = row * cell_height + baseline - frame.height
            if y < row * cell_height:
                raise ValueError(f"Frame {row},{col} is taller than its destination cell")
            output.alpha_composite(frame, (x, y))
            print(
                f"frame {row},{col}: source={box} size={frame.size} "
                f"destination=({x},{y}) foot={row * cell_height + baseline}"
            )

    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination)
    print(f"Wrote {destination} ({output.width}x{output.height})")


if __name__ == "__main__":
    main()
