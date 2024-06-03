package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.Handle("/", http.FileServer(http.Dir("../html/")))

	fmt.Println("run server: localhost:9000")
	err := http.ListenAndServe(":9000", nil)
	if err != nil {
		fmt.Println("Failed to start server", err)
		return
	}
}
