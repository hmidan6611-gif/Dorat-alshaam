import Foundation
import CoreGraphics

// Pure timing helpers. Every tile computes its pose from (t mod period) with these.

@inline(__always) func clamp01(_ x: Double) -> Double { min(max(x, 0), 1) }

@inline(__always) func lerp(_ a: Double, _ b: Double, _ p: Double) -> Double { a + (b - a) * p }

/// Seconds into the current cycle of `period`.
@inline(__always) func phase(_ t: Double, _ period: Double) -> Double {
    let r = t.truncatingRemainder(dividingBy: period)
    return r < 0 ? r + period : r
}

/// Index of the current cycle of `period`.
@inline(__always) func cycle(_ t: Double, _ period: Double) -> Int {
    Int((t / period).rounded(.down))
}

/// Normalised progress of x through [a, b], clamped.
@inline(__always) func seg(_ x: Double, _ a: Double, _ b: Double) -> Double {
    clamp01((x - a) / (b - a))
}

@inline(__always) func smooth(_ p: Double) -> Double {
    let x = clamp01(p)
    return x * x * (3 - 2 * x)
}

func easeIn(_ p: Double) -> Double {
    let x = clamp01(p)
    return x * x * x
}

func easeOut(_ p: Double) -> Double {
    let x = 1 - clamp01(p)
    return 1 - x * x * x
}

func easeInOut(_ p: Double) -> Double {
    let x = clamp01(p)
    if x < 0.5 { return 4 * x * x * x }
    let y = -2 * x + 2
    return 1 - y * y * y / 2
}

/// Overshoots past 1, then settles.
func easeOutBack(_ p: Double, _ s: Double = 1.70158) -> Double {
    let x = clamp01(p) - 1
    return 1 + (s + 1) * x * x * x + s * x * x
}

/// Hand-written damped spring from 0 to 1 (overshoot and settle).
func spring(_ p: Double, damping: Double = 6.5, bounces: Double = 1.6) -> Double {
    if p <= 0 { return 0 }
    if p >= 1 { return 1 }
    return 1 - exp(-damping * p) * cos(bounces * 2 * Double.pi * p)
}

/// Damped oscillation around 0 that starts at 0 (used for wobbles).
func wobble(_ p: Double, damping: Double = 4, cycles: Double = 2) -> Double {
    if p <= 0 || p >= 1 { return 0 }
    return exp(-damping * p) * sin(cycles * 2 * Double.pi * p)
}

/// A keyframe track: value at time, interpolated with an easing curve.
struct Track {
    let times: [Double]
    let values: [Double]

    init(_ pairs: [(Double, Double)]) {
        times = pairs.map { $0.0 }
        values = pairs.map { $0.1 }
    }

    /// Returns the segment the time falls in: from value, to value, local progress.
    func segment(_ u: Double) -> (from: Double, to: Double, p: Double) {
        if u <= times[0] { return (values[0], values[0], 1) }
        var i = 1
        while i < times.count {
            if u < times[i] {
                let p = (u - times[i - 1]) / (times[i] - times[i - 1])
                return (values[i - 1], values[i], p)
            }
            i += 1
        }
        let last = values[values.count - 1]
        return (last, last, 1)
    }

    func value(_ u: Double, _ ease: (Double) -> Double = easeInOut) -> Double {
        let s = segment(u)
        return lerp(s.from, s.to, ease(s.p))
    }
}
