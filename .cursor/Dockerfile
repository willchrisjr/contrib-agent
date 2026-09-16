FROM node:24-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && id ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu

USER ubuntu
WORKDIR /workspace
