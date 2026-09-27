import random
import sys
from pathlib import Path

import numpy as np
from manim import *

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # works without pip install too
from revrecom.chain import district_cells, revrecom_step, initial_plan  # noqa: E402
from revrecom.grid import CELLS, N, NEIGHBORS, rc  # noqa: E402


SEED = 1217
START = "strips"          # "strips" or "quadrants"
NUM_STEPS = 40            # chain steps to animate (self-loops count as steps)
SPEED = 0.5               # global time multiplier: 0.5 = twice as fast
INCLUDE_SAME_PAIR = True  # GerryChain also draws (d, d) pairs, which self-loop

CELL = 1.2
GRID_CENTER = np.array([0.0, -0.45, 0.0])

DISTRICT_COLORS = {0: "#E63946", 1: "#2F6FD6", 2: "#F4C430", 3: "#2A9D55"}
# merged region: the two districts' colours mixed like paint (0 red, 1 blue, 2 yellow, 3 green)
MERGED_COLORS = {
    (0, 1): "#7B3FA8",  # red + blue = purple
    (0, 2): "#F07A1A",  # red + yellow = orange
    (0, 3): "#8B5A2B",  # red + green = brown
    (1, 2): "#7CB83A",  # blue + yellow = yellow-green, lighter than district green
    (1, 3): "#138A8A",  # blue + green = teal
    (2, 3): "#B5A82A",  # yellow + green = olive
}
TREE_COLOR = WHITE
CUT_COLOR = "#FF4FB0"
HIGHLIGHT_COLOR = WHITE
GRID_LINE_COLOR = "#1A1A1A"
BORDER_COLOR = BLACK
REJECT_COLOR = "#FF6B6B"

GRID_LINE_WIDTH = 1.5
BORDER_WIDTH = 9
HIGHLIGHT_WIDTH = 8
TREE_WIDTH = 6
CUT_WIDTH = 11
NODE_RADIUS = 0.09
DIM_OPACITY = 0.3
COUNTER_SIZE = 30

# timings in seconds (all multiplied by SPEED)
T_SELECT = 0.25
T_MERGE = 0.3
T_TREE = 0.5
T_CUT = 0.3
T_PROPOSE = 0.35
T_RESOLVE = 0.3
T_STAY = 0.3
PAUSE = 0.1
# ================================================================

config.max_files_cached = 100_000  # one partial movie file per animation


def center(cell):
    r, c = rc(cell)
    return GRID_CENTER + np.array([(c - (N - 1) / 2) * CELL, ((N - 1) / 2 - r) * CELL, 0.0])


def side_line(a, b, color, width):
    """Line on the side shared by cell a and cell/position b, extended by half its
    thickness so perpendicular lines meet in clean corners."""
    ca = center(a)
    cb = center(b) if isinstance(b, (int, np.integer)) else b
    mid, d = (ca + cb) / 2, cb - ca
    perp = np.array([-d[1], d[0], 0.0])
    perp = perp / np.linalg.norm(perp) * (CELL / 2 + width / 200)
    return Line(mid - perp, mid + perp, color=color, stroke_width=width)


def outline(cells, color, width):
    """Every side of `cells` facing a cell outside the set (or the grid edge)."""
    cells = set(cells)
    g = VGroup()
    for v in cells:
        r, c = rc(v)
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            rr, cc = r + dr, c + dc
            if 0 <= rr < N and 0 <= cc < N:
                if rr * N + cc not in cells:
                    g.add(side_line(v, rr * N + cc, color, width))
            else:  # grid boundary: a virtual cell just outside
                g.add(side_line(v, center(v) + np.array([dc * CELL, -dr * CELL, 0.0]), color, width))
    return g


# ------------------------- the scene -------------------------
class ReComGrid(Scene):
    def construct(self):
        rng = random.Random(SEED)
        plan = initial_plan(START)

        self.squares = {}
        for cell in CELLS:
            sq = Square(side_length=CELL, stroke_color=GRID_LINE_COLOR, stroke_width=GRID_LINE_WIDTH,
                        fill_color=DISTRICT_COLORS[plan[cell]], fill_opacity=1)
            self.squares[cell] = sq.move_to(center(cell)).set_z_index(0)

        self.seams = {}
        for a in CELLS:
            for b in NEIGHBORS[a]:
                if a < b and plan[a] != plan[b]:
                    self.seams[frozenset((a, b))] = self.seam_line(a, b)

        perimeter = Square(side_length=N * CELL, stroke_color=BORDER_COLOR, stroke_width=BORDER_WIDTH)
        perimeter.move_to(GRID_CENTER).set_z_index(1)

        # counter: one Text line swapped in place each step (no LaTeX needed)
        self.step, self.accepted = 0, 0
        self.counter = self.counter_text()
        counters = self.counter

        self.play(FadeIn(VGroup(*self.squares.values()), *self.seams.values(), perimeter, counters),
                  run_time=0.6)
        self.wait(0.3)

        for step in range(1, NUM_STEPS + 1):
            self.step = step
            self.counter.become(self.counter_text())
            ev = revrecom_step(plan, rng, INCLUDE_SAME_PAIR)
            self.animate_step(ev)
            plan = ev["new_plan"]
        self.wait(1)

    # ---------- helpers ----------
    def t(self, seconds):
        return seconds * SPEED

    def counter_text(self):
        # left edge pinned so the text doesn't shift as the numbers grow
        txt = Text(f"Step {self.step}      Accepted moves {self.accepted}", font_size=COUNTER_SIZE)
        return txt.move_to(np.array([-3.2, 3.5, 0]), aligned_edge=LEFT)

    def seam_line(self, a, b, color=BORDER_COLOR):
        return side_line(a, b, color, BORDER_WIDTH).set_z_index(1)

    def dim_others(self, region, opacity):
        return [self.squares[c].animate.set_fill(opacity=opacity) for c in CELLS if c not in region]

    def stay_flash(self, hl, region):
        """Highlight turns red and fades: this step is a self-loop."""
        self.play(hl.animate.set_stroke(color=REJECT_COLOR), run_time=self.t(T_STAY / 2))
        self.play(FadeOut(hl), *self.dim_others(region, 1), run_time=self.t(T_STAY / 2))

    # ---------- one step ----------
    def animate_step(self, ev):
        plan = ev["old_plan"]
        d1, d2 = ev["pair"]

        # 1. select
        region = district_cells(plan, d1) | district_cells(plan, d2)
        hl = VGroup(outline(district_cells(plan, d1), HIGHLIGHT_COLOR, HIGHLIGHT_WIDTH),
                    outline(district_cells(plan, d2), HIGHLIGHT_COLOR, HIGHLIGHT_WIDTH)).set_z_index(2)
        self.play(*self.dim_others(region, DIM_OPACITY), Create(hl), run_time=self.t(T_SELECT))
        if ev["outcome"] in ("same", "not_adjacent"):
            self.stay_flash(hl, region)
            return

        # 2. merge
        seam_keys = [k for k in self.seams if {plan[c] for c in k} == {d1, d2}]
        merged_outline = outline(region, HIGHLIGHT_COLOR, HIGHLIGHT_WIDTH).set_z_index(2)
        self.play(*[FadeOut(self.seams.pop(k)) for k in seam_keys],
                  *[self.squares[c].animate.set_fill(MERGED_COLORS[tuple(sorted((d1, d2)))]) for c in region],
                  FadeOut(hl), FadeIn(merged_outline), run_time=self.t(T_MERGE))

        # 3. one spanning tree
        dots = {v: Dot(center(v), radius=NODE_RADIUS, color=TREE_COLOR).set_z_index(4) for v in region}
        lines = {e: Line(center(e[0]), center(e[1]), color=TREE_COLOR, stroke_width=TREE_WIDTH).set_z_index(3)
                 for e in ev["tree"]}
        self.play(LaggedStart(*[GrowFromCenter(d) for d in dots.values()],
                              *[Create(l) for l in lines.values()], lag_ratio=0.1),
                  run_time=self.t(T_TREE))
        self.wait(self.t(PAUSE))

        if ev["outcome"] == "no_cut":
            self.play(*[l.animate.set_color(REJECT_COLOR) for l in lines.values()],
                      merged_outline.animate.set_stroke(color=REJECT_COLOR), run_time=self.t(T_STAY / 2))
            self.revert(plan, region, [*dots.values(), *lines.values(), merged_outline])
            return

        # 4. cut edge: pink flash, then cut
        cut_line = lines[ev["cut_edge"]]
        self.play(cut_line.animate.set_stroke(color=CUT_COLOR, width=CUT_WIDTH), run_time=self.t(T_CUT / 2))
        self.play(FadeOut(cut_line, scale=0.1), run_time=self.t(T_CUT / 2))

        # 5. proposal: new districts, seam in pink
        proposal = ev["proposal"]
        prop_seams = [self.seam_line(*e, color=CUT_COLOR) for e in ev["seam"]]
        remaining = [l for e, l in lines.items() if e != ev["cut_edge"]]
        self.play(*[self.squares[c].animate.set_fill(DISTRICT_COLORS[proposal[c]]) for c in region],
                  FadeOut(*dots.values(), *remaining), *[Create(l) for l in prop_seams],
                  run_time=self.t(T_PROPOSE))
        self.wait(self.t(PAUSE))

        # 6. accept (seam turns black) or reject (seam flashes red, revert)
        if ev["outcome"] == "accepted":
            self.accepted += 1
            self.counter.become(self.counter_text())
            self.seams.update({frozenset(e): l for e, l in zip(ev["seam"], prop_seams)})
            self.play(*[l.animate.set_stroke(color=BORDER_COLOR) for l in prop_seams],
                      FadeOut(merged_outline), *self.dim_others(region, 1), run_time=self.t(T_RESOLVE))
        else:
            self.play(*[l.animate.set_stroke(color=REJECT_COLOR) for l in prop_seams],
                      merged_outline.animate.set_stroke(color=REJECT_COLOR), run_time=self.t(T_STAY / 2))
            self.revert(plan, region, [*prop_seams, merged_outline])

    def revert(self, plan, region, to_remove):
        """Return the region to the plan it had before this step (a self-loop)."""
        old_seams = {}
        for a in region:
            for b in NEIGHBORS[a]:
                if b in region and a < b and plan[a] != plan[b]:
                    old_seams[frozenset((a, b))] = self.seam_line(a, b)
        self.seams.update(old_seams)
        self.play(*[self.squares[c].animate.set_fill(DISTRICT_COLORS[plan[c]]) for c in region],
                  FadeOut(*to_remove), *[Create(l) for l in old_seams.values()],
                  *self.dim_others(region, 1), run_time=self.t(T_RESOLVE))
