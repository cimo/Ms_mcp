FROM ubuntu:24.04

ARG _ENV_NAME
ARG _DOMAIN
ARG _TIME_ZONE
ARG _LANG
ARG _SERVER_PORT
ARG _PATH_ROOT
ARG _PATH_CERTIFICATE_PEM
ARG _VERSION_TAG

ENV ENV_NAME=${_ENV_NAME}
ENV DOMAIN=${_DOMAIN}
ENV TZ=${_TIME_ZONE}
ENV LANG=${_LANG}
ENV SERVER_PORT=${_SERVER_PORT}
ENV PATH_ROOT=${_PATH_ROOT}
ENV PATH_CERTIFICATE_PEM=${_PATH_CERTIFICATE_PEM}
ENV VERSION_TAG=${_VERSION_TAG}

ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NOWARNINGS=yes
ENV SUDO_FORCE_REMOVE=yes
ENV HISTFILE="/home/node/.bash_history"
ENV NODE_OPTIONS=--use-openssl-ca
ENV NODE_EXTRA_CA_CERTS="${PATH_CERTIFICATE_PEM}"
ENV NPM_CONFIG_USERCONFIG="/home/node/.npmrc"
ENV WAYLAND_DISPLAY=wayland-0
ENV XDG_SESSION_TYPE=wayland
ENV XDG_RUNTIME_DIR="/mnt/wslg/runtime-dir/"
ENV ELECTRON_ENABLE_WAYLAND=1
ENV ELECTRON_OZONE_PLATFORM_HINT=auto
ENV OZONE_PLATFORM=wayland
ENV EGL_PLATFORM=wayland
ENV ANGLE_DEFAULT_PLATFORM=egl
ENV DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}bus"
ENV PULSE_SERVER="unix:/mnt/wslg/PulseServer"

COPY ./certificate/ /usr/local/share/ca-certificates/
COPY ./docker/font/ /usr/share/fonts/truetype/noto/
COPY ./docker/font.conf /etc/fonts/local.conf
COPY ./ ${PATH_ROOT}

RUN cd ~ \
    # No root
    && userdel -r ubuntu \
    && groupadd -g 1000 node \
    && useradd -m -u 1000 -g 1000 -d ${PATH_ROOT} -s /bin/bash node \
    && uid="$(id -u node)" \
    && mkdir -p ${PATH_ROOT} /home/node/ /run/user/${uid} \
    && chown -R node:node ${PATH_ROOT} /home/node/ /run/user/${uid} \
    && chmod -R 775 ${PATH_ROOT} /home/node/ \
    && chmod -R 700 /run/user/${uid} \
    # Update
    && echo 'Acquire::Retries "3";' > /etc/apt/apt.conf.d/80-retries \
    && echo 'Acquire::http::No-Cache "true";' > /etc/apt/apt.conf.d/99no-cache \
    && echo 'Acquire::https::No-Cache "true";' >> /etc/apt/apt.conf.d/99no-cache \
    && VERSION_CODENAME=$(grep VERSION_CODENAME= /etc/os-release | cut -d= -f2) \
    && chmod -R 0644 /usr/local/share/ca-certificates/ \
    && apt-get update && apt-get install -y ca-certificates tzdata curl media-types jq \
    && update-ca-certificates \
    && ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime && echo ${TZ} > /etc/timezone \
    && echo "application/typescript ts" >> /etc/mime.types \
    # NodeJs
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get update && apt-get install -y \
    nodejs \
    # Wslg
    && groupadd -g 110 render || true \
    && groupadd -g 44 video || true \
    && usermod -aG 110 node \
    && usermod -aG 44 node \
    && apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgtk-3-0 \
    libcairo2 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libxkbcommon0 \
    libfontconfig1 \
    libfreetype6 \
    libnss3 \
    libnspr4 \
    libasound2t64 \
    libgl1 \
    libglx-mesa0 \
    libgl1-mesa-dri \
    libegl1 \
    libegl1-mesa-dev \
    libegl-dev \
    libglvnd-dev \
    libgbm1 \
    mesa-va-drivers \
    mesa-utils-extra \
    libdrm2 \
    libxdamage1 \
    libxfixes3 \
    libxcomposite1 \
    libxrandr2 \
    libwayland-client0 \
    libwayland-egl1 \
    libwayland-cursor0 \
    libgomp1 \
    libatomic1 \
    xdg-utils \
    # Chrome
    && curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /home/chrome.deb \
    && apt-get update && apt-get install -y /home/chrome.deb \
    && rm /home/chrome.deb \
    # Xvfb
    && apt-get update && apt-get install -y \
    xvfb \
    libxtst-dev \
    # Clean
    && apt-get remove --purge -y sudo \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean -y \
    && apt-get autoclean -y \
    && apt-get autoremove -y

USER node

WORKDIR ${PATH_ROOT}

RUN \
    # Npm    
    bash ${PATH_ROOT}script/npm.sh "build"

CMD \
    # Dbus
    bash ${PATH_ROOT}script/dbus.sh \
    # NodeJs
    && bash ${PATH_ROOT}script/nodejs.sh

EXPOSE ${SERVER_PORT}
