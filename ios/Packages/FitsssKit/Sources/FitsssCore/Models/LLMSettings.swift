import Foundation

/// Which model answers which question. Mirrors `LlmSettings` in
/// `src/lib/settings/llm.ts`.
nonisolated public struct LLMChoice: Codable, Hashable, Sendable {
    /// `openrouter`, `anthropic` or `mock`.
    public var provider: String
    /// Task id (`outfits`, `taste`, `vision`) to an OpenRouter-style model id
    /// (`anthropic/claude-opus-5`).
    public var models: [String: String]
    /// `low`, `medium` or `high`.
    public var effort: String
}

/// Which settings the server's environment holds, by variable name
/// (`LLM_MOCK`, `LLM_MODEL_VISION`); nil where the person's choice applies.
nonisolated public struct LLMPins: Codable, Hashable, Sendable {
    public var provider: String?
    public var models: [String: String?]
    public var effort: String?

    public func model(_ task: String) -> String? { models[task] ?? nil }
}

nonisolated public struct LLMProvider: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var label: String
    /// The environment variable holding its key; nil for the mock.
    public var keyVar: String?
    /// Whether the server has that key.
    public var configured: Bool
    /// The model ids it can call (`anthropic/`); nil for any.
    public var modelPrefix: String?

    public var isMock: Bool { keyVar == nil }

    /// Whether this provider can call a model id. One called directly
    /// serves its own models, not OpenRouter's variants of them
    /// (`anthropic/claude-sonnet-5:batch`).
    public func serves(_ modelId: String) -> Bool {
        guard let modelPrefix else { return true }
        return modelId.hasPrefix(modelPrefix) && !modelId.contains(":")
    }
}

nonisolated public struct LLMTask: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var label: String
    /// What the task does, one sentence.
    public var hint: String
    /// Only models that take a picture can do it.
    public var needsVision: Bool
}

/// `GET /api/v1/settings/llm`.
nonisolated public struct LLMSettings: Codable, Hashable, Sendable {
    /// What a model call will use: `chosen` with the pins on top.
    public var settings: LLMChoice
    /// What the person picked.
    public var chosen: LLMChoice
    public var pinned: LLMPins
    public var providers: [LLMProvider]
    public var tasks: [LLMTask]
    public var effortLevels: [String]

    public var provider: LLMProvider? { providers.first { $0.id == settings.provider } }

    /// The person's choice changed locally, ahead of the server's answer:
    /// what is in effect follows except where a pin holds it.
    public func applying(_ change: LLMChange) -> LLMSettings {
        var next = self
        if let provider = change.provider {
            next.chosen.provider = provider
            if pinned.provider == nil { next.settings.provider = provider }
        }
        if let effort = change.effort {
            next.chosen.effort = effort
            if pinned.effort == nil { next.settings.effort = effort }
        }
        for (task, model) in change.models ?? [:] {
            next.chosen.models[task] = model
            if pinned.model(task) == nil { next.settings.models[task] = model }
        }
        return next
    }
}

/// `PATCH /api/v1/settings/llm`: only what is set changes.
nonisolated public struct LLMChange: Encodable, Hashable, Sendable {
    public var provider: String?
    public var effort: String?
    public var models: [String: String]?

    public init(provider: String? = nil, effort: String? = nil, models: [String: String]? = nil) {
        self.provider = provider
        self.effort = effort
        self.models = models
    }
}

/// One model OpenRouter offers.
nonisolated public struct LLMModel: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var contextLength: Int
    /// US dollars per million tokens; -1 when it varies (a router such as
    /// `openrouter/auto` costs what the model it picks costs).
    public var promptPricePerM: Double
    public var completionPricePerM: Double
    public var vision: Bool
    public var reasoning: Bool
}

/// `GET /api/v1/settings/llm/models`.
nonisolated public struct LLMModelList: Codable, Hashable, Sendable {
    /// Every model that can answer in a schema, by id.
    public var models: [LLMModel]
    /// The ones worth reaching for first, in order.
    public var suggested: [String]

    public func model(_ id: String) -> LLMModel? { models.first { $0.id == id } }
}

/// `POST /api/v1/settings/llm/test`.
nonisolated public struct LLMTestResult: Codable, Hashable, Sendable {
    /// The model that answered, as the provider named it.
    public var model: String
    public var ms: Int
    /// What came back, shortened.
    public var sample: String
}
