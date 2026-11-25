{
  "targets": [
    {
      "target_name": "pwaos_addon",
      # Sources live in this repo's src/ (upstream pwaos-node-addon C++
      # client). Client-side build fixes live here in binding.gyp: the
      # upstream sources use std::unique_ptr/make_unique without <memory>
      # and are built with C++20 upstream, so the include/standard are
      # forced below. The same relative paths work in the monorepo
      # submodule checkout and in the published npm tarball.
      "sources": [
        "src/addon_main.cc",
        "src/app_obj.cc",
        "src/instance_obj.cc",
        "src/interface_obj.cc"
      ],
      "include_dirs": [
        "<!(node scripts/sdk-dir.cjs)/include",
        "src"
      ],
      "defines": [
        "NAPI_CPP_EXCEPTIONS"
      ],
      "conditions": [
        # Link the SDK import library from the platform lib dir. Linux loads
        # the .so via embedded rpath; Windows needs the DLL beside the addon,
        # so the copies section drops it into build/Release.
        ["OS=='linux'", {
          "libraries": [
            "-Wl,-rpath,<!(node scripts/sdk-dir.cjs)/lib/linux"
          ],
          "library_dirs": [
            "<!(node scripts/sdk-dir.cjs)/lib/linux"
          ],
          "libraries!": [
            "-ldl",
            "-lpthread"
          ],
          "libraries+": [
            "-lpwaos_runtime_api"
          ],

          "defines+": [
            "LONGSTRINGS"
          ],
          # Upstream src/ (pwaos-node-addon#main) uses std::unique_ptr /
          # std::make_unique in common.h macros without including <memory>,
          # and is built with C++20 upstream. Force the include here so the
          # client package compiles the untouched upstream sources.
          "cflags_cc+": [
            "-std=c++20",
            "-include", "memory"
          ]
        }],
        ["OS=='win'", {
          "library_dirs": [
            "<!(node scripts/sdk-dir.cjs)/lib/win"
          ],
          "libraries": [
            "pwaos_runtime_api.lib"
          ],
          "defines+": [
            "WIN32"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++20", "/utf-8"],
              "ForcedIncludeFiles": ["memory"]
            }
          },
          "copies": [
            {
              "destination": "<(PRODUCT_DIR)",
              "files": [
                "<!(node scripts/sdk-dir.cjs)/lib/win/pwaos_runtime_api.dll"
              ]
            }
          ]
        }]
      ]
    }
  ]
}
