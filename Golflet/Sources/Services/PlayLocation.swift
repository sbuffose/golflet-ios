import Foundation
import CoreLocation

@MainActor
@Observable
final class PlayLocation: NSObject, CLLocationManagerDelegate {
    var coordinate: GPSCoord?
    var accuracyM: Double?
    var authorized = false
    var denied = false
    var errorMessage: String?

    private let manager = CLLocationManager()
    private let demo = GPSCoord(lat: -34.485427, lng: -58.532351)

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 2
        if RuntimeFlags.isUITesting {
            coordinate = demo
            accuracyM = 4
            authorized = true
        }
    }

    func start() {
        if RuntimeFlags.isUITesting {
            coordinate = demo
            accuracyM = 4
            authorized = true
            return
        }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            authorized = true
            manager.startUpdatingLocation()
        case .denied, .restricted:
            denied = true
        default:
            manager.requestWhenInUseAuthorization()
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            authorized = true
            denied = false
            manager.startUpdatingLocation()
        case .denied, .restricted:
            denied = true
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        coordinate = GPSCoord(lat: last.coordinate.latitude, lng: last.coordinate.longitude)
        accuracyM = last.horizontalAccuracy > 0 ? last.horizontalAccuracy : nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if RuntimeFlags.isUITesting { return }
        errorMessage = error.localizedDescription
    }
}