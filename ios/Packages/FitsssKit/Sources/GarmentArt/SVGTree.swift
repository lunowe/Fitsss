import Foundation

/// A parsed SVG element: lowercased name and attribute keys, children in
/// document order. Text content is dropped; nothing here needs it.
nonisolated final class SVGNode {
    let name: String
    let attributes: [String: String]
    var children: [SVGNode] = []

    init(name: String, attributes: [String: String]) {
        self.name = name
        self.attributes = attributes
    }

    /// Parses the inner markup of an `<svg>` (a drawing's `body`) under a
    /// synthetic root. Malformed markup keeps what parsed before the error.
    static func parse(body: String) -> SVGNode {
        let document = "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
            + body + "</svg>"
        let builder = Builder()
        let parser = XMLParser(data: Data(document.utf8))
        parser.shouldProcessNamespaces = false
        parser.shouldResolveExternalEntities = false
        parser.delegate = builder
        parser.parse()
        return builder.root ?? SVGNode(name: "svg", attributes: [:])
    }

    /// Every element with an `id`, for `url(#id)` references.
    func collectIDs(into table: inout [String: SVGNode]) {
        if let id = attributes["id"], table[id] == nil { table[id] = self }
        for child in children { child.collectIDs(into: &table) }
    }

    nonisolated private final class Builder: NSObject, XMLParserDelegate {
        var root: SVGNode?
        private var stack: [SVGNode] = []

        func parser(
            _ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
            qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]
        ) {
            var attributes: [String: String] = [:]
            attributes.reserveCapacity(attributeDict.count)
            for (key, value) in attributeDict { attributes[key.lowercased()] = value }
            // `svg:path` and the like: the local name is what matters.
            let local = elementName.split(separator: ":").last.map(String.init) ?? elementName
            let node = SVGNode(name: local.lowercased(), attributes: attributes)
            if let parent = stack.last {
                parent.children.append(node)
            } else if root == nil {
                root = node
            }
            stack.append(node)
        }

        func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
            _ = stack.popLast()
        }
    }
}
