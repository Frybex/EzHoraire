#!/bin/bash
export PATH="/Users/maxencebastin/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "/Users/maxencebastin/Documents/Bloem/EzHoraire"
/Users/maxencebastin/.local/bin/node surveillance-seo/verifier.mjs >> rapports-seo/execution.log 2>&1
