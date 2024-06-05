package main

import (
	"Idle-Labyrinth/j"
	"fmt"
	"time"
)

func main() {
	j.Init()

	//const canvas = document.createElement("canvas");
	//canvas.width = width * factor;
	//canvas.height = height * factor;
	//const ctx = canvas.getContext("2d");
	//ctx.imageSmoothingEnabled = false;
	//ctx.imageSmoothingQuality = "high";
	//if (isIE) (<any>ctx).msImageSmoothingEnabled = false;
	//ctx.drawImage(image, ofsX, ofsY, width, height, 0, 0, width * factor, height * factor);
	//
	//const result = new Image;
	//result.src = canvas.toDataURL("image/png");
	//return result;

	canvas := j.Document.Call("createElement", "canvas")
	canvas.Set("width", 640)
	canvas.Set("height", 480)
	ctx := canvas.Call("getContext", "2d")

	ctx.Set("strokeStyle", "#fff")
	ctx.Set("lineWidth", 1)

	ctx.Call("beginPath")
	ctx.Call("moveTo", 10, 10)
	ctx.Call("lineTo", 100, 100)
	ctx.Call("lineTo", 50, 70)
	ctx.Call("lineTo", 10, 10)
	ctx.Call("stroke")

	img := j.Global.Get("Image").New()
	img.Set("src", canvas.Call("toDataURL", "image/png"))

	time.Sleep(time.Second / 10) // async problem

	j.Ctx.Call("drawImage", img, 0, 0)

	fmt.Println("hello worlds3")
	<-make(chan struct{})
}
