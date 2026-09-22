//
//  Item.swift
//  dm
//
//  Created by izowooi on 9/22/26.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date

    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
