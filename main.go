package main

import (
	"Idle-Labyrinth/j"
	"fmt"
)

func main() {
	j.Init()

	w, h := j.GetWindowSize()
	fmt.Println("hello worlds", w, h)
	<-make(chan struct{})
}
