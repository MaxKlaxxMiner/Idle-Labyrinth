package j

import "syscall/js"

var (
	Window       js.Value
	Document     js.Value
	Location     js.Value
	Body         js.Value
	LocalStorage js.Value
	Global       js.Value
	UserAgent    string
)

func Init() {
	Global = js.Global()
	Window = Global.Get("window")
	Document = Window.Get("document")
	Location = Window.Get("location")
	Body = Document.Get("body")
	LocalStorage = Global.Get("localStorage")
	UserAgent = Window.Get("navigator").Get("userAgent").String()
}
