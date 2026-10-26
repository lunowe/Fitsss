import CoreLocation
import Foundation

/// One position for today's forecast, when-in-use only. Never throws: a
/// refused prompt, a timeout or a failed fix is just "no position", and Today
/// falls back to weather set by hand, like the web's `currentPosition()`.
final class LocationProvider: NSObject, CLLocationManagerDelegate {
    nonisolated enum Outcome: Equatable, Sendable {
        case located(latitude: Double, longitude: Double)
        /// The user (or a restriction) said no. Only Settings can change it.
        case denied
        /// No fix in time, or location services are off.
        case unavailable
    }

    /// The web waits 8 seconds for `getCurrentPosition` too.
    static let timeout: Duration = .seconds(8)
    /// A fix this recent is good enough for a forecast (the web's `maximumAge`).
    static let maxAge: TimeInterval = 30 * 60

    private let manager = CLLocationManager()
    private var authorizationWaiters: [CheckedContinuation<Void, Never>] = []
    private var locationWaiters: [CheckedContinuation<Outcome, Never>] = []
    /// Tells a timeout apart from the request it was started for.
    private var request = 0

    override init() {
        super.init()
        manager.delegate = self
        // A forecast needs the city, not the street.
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    /// Whether the user turned location off for Fitsss.
    var isDenied: Bool {
        switch manager.authorizationStatus {
        case .denied, .restricted: true
        default: false
        }
    }

    func locate() async -> Outcome {
        if manager.authorizationStatus == .notDetermined {
            // No timeout here: the user is reading the prompt.
            await withCheckedContinuation { continuation in
                authorizationWaiters.append(continuation)
                if authorizationWaiters.count == 1 { manager.requestWhenInUseAuthorization() }
            }
        }
        switch manager.authorizationStatus {
        case .denied, .restricted:
            return .denied
        case .authorizedWhenInUse, .authorizedAlways:
            break
        default:
            return .unavailable
        }
        if let recent = manager.location, -recent.timestamp.timeIntervalSinceNow < Self.maxAge {
            return .located(latitude: recent.coordinate.latitude, longitude: recent.coordinate.longitude)
        }
        return await withCheckedContinuation { continuation in
            locationWaiters.append(continuation)
            guard locationWaiters.count == 1 else { return }
            request += 1
            let current = request
            manager.requestLocation()
            Task { [weak self] in
                try? await Task.sleep(for: Self.timeout)
                guard let self, self.request == current else { return }
                self.finish(.unavailable)
            }
        }
    }

    private func finish(_ outcome: Outcome) {
        request += 1
        let waiters = locationWaiters
        locationWaiters = []
        for waiter in waiters { waiter.resume(returning: outcome) }
    }

    private func authorizationChanged(_ status: CLAuthorizationStatus) {
        guard status != .notDetermined else { return }
        let waiters = authorizationWaiters
        authorizationWaiters = []
        for waiter in waiters { waiter.resume() }
    }

    // MARK: CLLocationManagerDelegate
    //
    // The manager was created on the main thread, so it calls back there.

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        MainActor.assumeIsolated { authorizationChanged(status) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        let outcome = Outcome.located(latitude: coordinate.latitude, longitude: coordinate.longitude)
        MainActor.assumeIsolated { finish(outcome) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        let denied = (error as? CLError)?.code == .denied
        MainActor.assumeIsolated { finish(denied ? .denied : .unavailable) }
    }
}
