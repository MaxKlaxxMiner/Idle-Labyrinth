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

	ctx.Set("strokeStyle", "#08f")
	ctx.Set("lineWidth", 1)

	ctx.Call("beginPath")
	for x := 0; x < 640; x += 5 {
		ctx.Call("moveTo", x, 0)
		ctx.Call("lineTo", 639, 479)
	}
	ctx.Call("stroke")

	img := j.Global.Get("Image").New()
	img.Set("src", canvas.Call("toDataURL", "image/png"))

	// if (this.allImages[i].complete && this.allImages[i].naturalHeight !== 0)
	time.Sleep(time.Second / 100) // async problem

	for y := 0; y < j.Height; y += 480 {
		for x := 0; x < j.Width; x += 640 {
			j.Ctx.Call("drawImage", img, x, y)
		}
	}

	fmt.Println("hello worlds3")
	<-make(chan struct{})
}
