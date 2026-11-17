#!/usr/bin/env python3
"""Synthesize demoday's sound effects (stdlib only, no samples to license).

Usage: python3 scripts/make-sfx.py [out_dir]   (default: assets/sfx)
Writes 16-bit mono 44.1kHz WAVs: key1-4 (tactile mechanical), space, click, enter, whoosh, chime, stamp, thud, pop.
"""
import math
import os
import random
import struct
import sys
import wave

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "assets", "sfx")


def save(name, xs, gain=0.9):
    peak = max(1e-9, max(abs(x) for x in xs))
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(32767 * gain * x / peak)) for x in xs))


def n(sec):
    return int(sec * SR)


def lowpass(xs, a):
    """One-pole low-pass; a in (0,1], smaller = darker. a may be a per-sample list."""
    y, out = 0.0, []
    for i, x in enumerate(xs):
        k = a[i] if isinstance(a, list) else a
        y += k * (x - y)
        out.append(y)
    return out


def highpass(xs, a):
    lp = lowpass(xs, a)
    return [x - l for x, l in zip(xs, lp)]


def noise(count, seed):
    r = random.Random(seed)
    return [r.uniform(-1, 1) for _ in range(count)]


def bandpass(xs, lo, hi):
    return highpass(lowpass(xs, lo), hi)


def switch(seed, thock=420, body=0.85, plate=1.0, bump=1.0, release=0.5, size=1.0):
    """Mechanical tactile switch: bump click on actuation, bottom-out thock, quieter upstroke."""
    r = random.Random(seed)
    L = n(0.16 * size)
    out = [0.0] * L

    def burst(at, dur, amp, lo, hi, s):
        s0 = n(at)
        nz = bandpass(noise(n(dur), s), lo, hi)
        for i, x in enumerate(nz):
            if s0 + i < L:
                t = i / SR
                out[s0 + i] += amp * x * math.exp(-t / (dur / 5))

    def ring(at, f0, amp, decay):
        s0 = n(at)
        for i in range(s0, L):
            t = (i - s0) / SR
            out[i] += amp * math.sin(2 * math.pi * f0 * t) * math.exp(-t / decay) * min(1, t / 0.0006)

    # 1. tactile bump: a crisp, dry tick
    burst(0.0, 0.006, 0.85 * bump, 0.55, 0.18, seed * 7 + 1)
    # 2. bottom-out ~9ms later: plate/case thock (low body + wooden mid) with a little noise
    hit = 0.009 + r.uniform(-0.0015, 0.0015)
    f = thock * r.uniform(0.94, 1.06)
    ring(hit, f, 0.8 * body, 0.009 * size)
    ring(hit, f * 2.37, 0.3 * body, 0.0045)
    ring(hit, f * 4.1, 0.1 * plate, 0.003)
    burst(hit, 0.016, 1.0 * plate, 0.35, 0.05, seed * 7 + 2)
    # 3. upstroke on release, quieter and a touch higher
    up = 0.075 * size + r.uniform(-0.01, 0.01)
    burst(up, 0.008, 0.28 * release, 0.5, 0.12, seed * 7 + 3)
    ring(up + 0.002, f * 1.35, 0.15 * release, 0.004)
    return out


def mouse_click():
    L = n(0.09)
    nz = highpass(noise(L, 7), 0.4)
    out = [0.0] * L
    for start, amp in ((0.0, 1.0), (0.055, 0.55)):  # press, release
        s = n(start)
        for i in range(s, L):
            t = (i - s) / SR
            out[i] += amp * (nz[i] * math.exp(-t / 0.0022) + 0.4 * math.sin(2 * math.pi * 3200 * t) * math.exp(-t / 0.004))
    return out


def enter():
    return switch(91, thock=300, body=1.15, plate=1.2, bump=1.1, release=0.7, size=1.25)


def whoosh(dur=0.45):
    L = n(dur)
    nz = noise(L, 23)
    sweep = [0.02 + 0.25 * math.sin(math.pi * i / L) ** 2 for i in range(L)]
    f = lowpass(nz, sweep)
    return [f[i] * math.sin(math.pi * i / L) ** 1.5 for i in range(L)]


def chime():
    L = n(1.6)
    out = [0.0] * L
    for start, f0 in ((0.0, 1318.5), (0.09, 1975.5)):  # E6 then B6
        s = n(start)
        for i in range(s, L):
            t = (i - s) / SR
            env = math.exp(-t / 0.45) * min(1, t / 0.004)
            out[i] += env * (math.sin(2 * math.pi * f0 * t) + 0.3 * math.sin(2 * math.pi * f0 * 2.01 * t) + 0.12 * math.sin(2 * math.pi * f0 * 3.02 * t))
    return out


def stamp():
    L = n(0.3)
    nz = lowpass(noise(L, 31), 0.5)
    out = []
    for i in range(L):
        t = i / SR
        f = 95 * math.exp(-t / 0.08) + 45
        out.append(0.9 * math.sin(2 * math.pi * f * t) * math.exp(-t / 0.09) + 0.8 * nz[i] * math.exp(-t / 0.012))
    return out


def thud():
    L = n(0.16)
    nz = lowpass(noise(L, 41), 0.3)
    out = []
    for i in range(L):
        t = i / SR
        out.append(0.8 * math.sin(2 * math.pi * 120 * t) * math.exp(-t / 0.04) + 0.5 * nz[i] * math.exp(-t / 0.008))
    return out


def pop():
    L = n(0.08)
    out, ph = [], 0.0
    for i in range(L):
        t = i / SR
        ph += 2 * math.pi * (520 + 700 * t / 0.08) / SR
        out.append(math.sin(ph) * math.exp(-t / 0.025) * min(1, t / 0.002))
    return out


for i, (seed, thock) in enumerate([(1, 430), (2, 400), (3, 455), (4, 415)], 1):
    save(f"key{i}", switch(seed, thock), 0.8)
save("space", switch(77, thock=250, body=1.2, plate=0.9, bump=0.8, release=0.9, size=1.35), 0.85)
save("click", mouse_click())
save("enter", enter())
save("whoosh", whoosh(), 0.7)
save("chime", chime(), 0.75)
save("stamp", stamp())
save("thud", thud(), 0.8)
save("pop", pop(), 0.7)
print("wrote", os.path.abspath(OUT))
