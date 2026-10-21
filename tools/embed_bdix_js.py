import base64, pathlib, textwrap

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "NextGenBDIX/src/main/kotlin/com/nextgenbdix/runtime/JsAssets.kt"
CHUNK = 20000

def chunks(path):
    b64 = base64.b64encode((root / path).read_bytes()).decode()
    return [b64[i:i + CHUNK] for i in range(0, len(b64), CHUNK)]

def kotlin_list(name, parts):
    body = ",\n".join(f'        "{p}"' for p in parts)
    return f"    private val {name} = listOf(\n{body}\n    )\n"

src = f'''package com.nextgenbdix

import android.util.Base64

internal object JsAssets {{
{kotlin_list("cryptoJsParts", chunks("js/crypto-js.min.js"))}
{kotlin_list("bootstrapParts", chunks("js/bootstrap.js"))}
    private fun decode(parts: List<String>): String =
        String(Base64.decode(parts.joinToString(""), Base64.DEFAULT), Charsets.UTF_8)

    val cryptoJs: String by lazy {{ decode(cryptoJsParts) }}

    val bootstrap: String by lazy {{ decode(bootstrapParts) }}

    fun page(): String {{
        fun safe(s: String) = s.replace("</script", "<\\\\/script")
        return "<!doctype html><html><head><meta charset=\\"utf-8\\"><script>" + safe(cryptoJs) +
            "</script><script>" + safe(bootstrap) + "</script></head><body></body></html>"
    }}
}}
'''
out.write_text(src)
