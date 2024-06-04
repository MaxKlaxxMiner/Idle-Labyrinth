package j

import (
	"syscall/js"
)

var (
	Window       js.Value
	Document     js.Value
	Location     js.Value
	Body         js.Value // HTMLElement
	LocalStorage js.Value // Storage
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

	initGraphics()
}

var (
	Canvas js.Value // HTMLCanvasElement
	Ctx    js.Value // CanvasRenderingContext2D
	Width  int
	Height int
)

func initGraphics() {
	Canvas = Document.Call("createElement", "canvas")                  // canvas = document.createElement("canvas");
	Body.Call("insertBefore", Canvas, Body.Get("childNodes").Index(0)) // document.body.insertBefore(canvas, document.body.childNodes[0]);
	Ctx = Canvas.Call("getContext", "2d")                              // ctx = this.canvas.getContext("2d");
	UpdateSize()
	Window.Set("onresize", js.FuncOf(func(_ js.Value, _ []js.Value) any { // window.onresize = () => UpdateSize()
		UpdateSize()
		return nil
	}))
}

func UpdateSize() {
	Width, Height = GetWindowSize()
	Canvas.Set("width", Width)
	Canvas.Set("height", Height)
}
