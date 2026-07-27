import XCTest

@MainActor
final class PreviewScreenshot: XCTestCase {
    func testCaptureScreenshots() {
        let app = XCUIApplication()
        setupSnapshot(app)
        app.launch()

        sleep(3)
        snapshot("01-feed")

        app.buttons["tabbar_profile"].tap()
        sleep(1)
        app.buttons["signin_button"].tap()
        sleep(1)
        snapshot("02-signin")
        if app.buttons["Cancel"].exists {
            app.buttons["Cancel"].tap()
        } else if app.navigationBars.buttons.firstMatch.exists {
            app.navigationBars.buttons.firstMatch.tap()
        }
        sleep(1)
        snapshot("03-profile")

        app.buttons["tabbar_ideas"].tap()
        sleep(2)
        snapshot("04-ideas")
    }
}
