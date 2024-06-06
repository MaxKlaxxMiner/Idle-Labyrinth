package main

import (
	"Idle-Labyrinth/j"
	"fmt"
	"syscall/js"
	"time"
)

func createImage(width, height, caro int) js.Value {
	canvas := j.Document.Call("createElement", "canvas")
	canvas.Set("width", width)
	canvas.Set("height", height)
	ctx := canvas.Call("getContext", "2d")

	ctx.Set("fillStyle", "#08f")
	ctx.Set("strokeStyle", "#08f")
	ctx.Set("lineWidth", 1)

	caro2 := caro * 2
	for y := 0; y < height; y += caro {
		for x := 0; x < width; x += caro {
			if x%caro2 == y%caro2 {
				ctx.Call("fillRect", x, y, caro, caro)
			}
		}
	}

	//ctx.Call("beginPath")
	//for x := 0; x < 640; x += 5 {
	//	ctx.Call("moveTo", x, 0)
	//	ctx.Call("lineTo", 639, 479)
	//}
	//ctx.Call("stroke")

	img := j.Global.Get("Image").New()
	img.Set("src", canvas.Call("toDataURL", "image/png"))
	return img
}

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

	var imgs []js.Value
	for i := 1; i <= 400; i++ {
		if 640%(i*2) == 0 && 480%(i*2) == 0 {
			img := createImage(640, 480, i)
			imgs = append(imgs, img)
		}
	}

	// if (this.allImages[i].complete && this.allImages[i].naturalHeight !== 0)
	time.Sleep(time.Second / 100) // async problem

	for {
		for i := range imgs {
			i = 5
			j.Ctx.Call("clearRect", 0, 0, j.Width, j.Height)
			for y := -int(int64(time.Now().UnixMilli()/7) % 1000); y < j.Height; y += 480 {
				for x := -int(int64(time.Now().UnixMilli()/7) % 1000); x < j.Width; x += 640 {
					j.Ctx.Call("drawImage", imgs[i], x, y)
				}
			}
			time.Sleep(time.Second / 144)
		}
	}

	fmt.Println("hello worlds3")
	<-make(chan struct{})
}
