package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:dist
var assets embed.FS

func main() {
	app, err := NewApp()
	if err != nil {
		log.Fatal(err)
	}

	if err := wails.Run(&options.App{
		Title:     "Larry AI",
		Width:     1600,
		Height:    960,
		MinWidth:  1120,
		MinHeight: 720,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []any{
			app,
		},
	}); err != nil {
		log.Fatal(err)
	}
}
