package j

func GetWindowSize() (w, h int) {
	return Window.Get("innerWidth").Int(), Window.Get("innerHeight").Int()
}
