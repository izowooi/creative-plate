import Foundation

/// 수식키 하나만 짧게 두 번 눌렀다 뗐는지 판정한다. 중간에 다른 키나 다른 수식키가 끼면 무효.
struct DoubleTapDetector {
    var maxHold: TimeInterval = 0.3
    var maxGap: TimeInterval = 0.4

    private var downAt: TimeInterval?
    private var interrupted = false
    private var lastTapAt: TimeInterval?

    /// 탭이 두 번 완성된 순간(두 번째로 키를 뗄 때) true 를 돌려준다.
    mutating func modifiersChanged(targetDown: Bool, othersDown: Bool, at now: TimeInterval) -> Bool {
        if othersDown {
            downAt = nil
            lastTapAt = nil
            return false
        }
        if targetDown {
            if downAt == nil {
                downAt = now
                interrupted = false
            }
            return false
        }
        guard let pressedAt = downAt else { return false }
        downAt = nil

        guard !interrupted, now - pressedAt <= maxHold else {
            lastTapAt = nil
            return false
        }
        if let previous = lastTapAt, now - previous <= maxGap {
            lastTapAt = nil
            return true
        }
        lastTapAt = now
        return false
    }

    mutating func keyPressed() {
        interrupted = true
        lastTapAt = nil
    }
}
