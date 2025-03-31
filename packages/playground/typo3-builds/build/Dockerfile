FROM emscripten/emsdk:3.1.24 as emscripten
SHELL ["/bin/bash", "-c"]
WORKDIR /root

ARG TYPO3_ZIP_URL=https://typo3.org/typo3-6.1.1.zip
ENV TYPO3_ZIP_URL ${TYPO3_ZIP_URL}

ARG OUT_FILENAME=wp
ENV OUT_FILENAME ${OUT_FILENAME}

RUN mkdir /root/output

RUN set -euxo pipefail;\
    apt-get update; \
    emsdk install latest;

COPY ./typo3 /root/typo3

# === Minify WordPress ===

# Remove non-default themes
RUN cat typo3/wp-includes/default-constants.php | awk -F"'" "/define\( 'TYPO3_DEFAULT_THEME'/"'{print $4}' > typo3/.default_theme
RUN export KEEP_THEME=$(cat typo3/.default_theme); \
    cd typo3/wp-content/themes && \
    rm -r $(ls | grep -v $KEEP_THEME)

# Separate WordPress static files
RUN cp -r typo3 typo3-static && \
    cd typo3-static && \
    find ./ -name '*.php' -delete && \
    find ./ -name '*.sqlite' -delete && \
    # Keep only the static files inside the directories like wp-admin or wp-content:
    find . -maxdepth 1 -type f -delete && \
    # Remove all empty directories
    find . -type d -empty -delete

# List assets that will be available to remotely so Playground can judge whether
# to request a remote asset or delegate the request for a missing file to PHP.
RUN find typo3-static -type f | sed 's#^typo3-static/##'> typo3-remote-asset-paths

# Make the remote asset listing available remotely so it can be downloaded
# directly in cases where an older minified WordPress build without this file
# has been saved to browser storage.
RUN cp typo3-remote-asset-paths typo3-static/

# ZIP the static files
RUN cd typo3-static/ && \
    zip -r ../typo3-static.zip . && \
    cd ..

# Move ZIP to the public output directory
RUN cp typo3-static.zip typo3-static/

# Move the static files to the final output directory
RUN mkdir /root/output/$OUT_FILENAME
RUN mv typo3-static/* /root/output/$OUT_FILENAME/

# Remove static files not used by PHP
RUN cd typo3 && \
    find ./ -type f \( \
    -name '*.eot' -o -name '*.gif' -o -name '*.htaccess' \
    -o -name '*.md' -o -name '*.mp4' -o -name '*.png' \
    -o -name '*.scss' -o -name '*.stylelintignore' -o -name '*.svg' \
    -o -name '*.ttf' -o -name '*.txt' -o -name '*.woff' \
    -o -name '*.woff2' -o -name '*.jpeg' -o -name '*.jpg' \
    \) \
    # Preserve the wp-admin SVG files that are read  by PHP
    -not -path '*/wp-admin/images/*.svg' \
    # Some plugins use the dashicons font. See #729.
    -not -path '*/wp-includes/fonts/dashicons.svg' \
    # WordPress functions like wp_mime_type_icon() use
    # the icons shipped in images/media. See #770.
    -not -path '*/wp-includes/images/media/*' \
    -delete

# Keep only the CSS files that are read by PHP
RUN cd typo3 && \
    find ./ -type f -name '*.css' \
    -not -path '*/wp-includes/blocks/*/*.min.css' \
    -not -path '*/wp-content/themes/*/style.css' \
    -not -path '*/wp-includes/css/wp-embed-template.min.css' \
    -delete && \
    find ./ -type f -name '*-rtl.min.css' -delete && \
    # Keep only the JS files that are read by PHP
    find ./ -type f -name '*.js' \
    -not -path '*/wp-includes/blocks/*/*.min.js' \
    -not -name 'wp-emoji-loader.min.js' \
    -not -path '*/wp-includes/js/wp-embed.min.js' \
    -not -path '*/wp-includes/js/wp-embed-template.min.js' \
    # This file is patched in JavaScript and needs to
    # be served from VFS. See #703
    -not -path '*/wp-includes/js/dist/block-editor*.js' \
    # Akismet is shipped with WordPress and it
    # requires the included files to be present
    -not -path '*/wp-content/plugins/akismet/*' \
    -delete

RUN cd typo3 && \
    # Remove any empty directories
    find . -type d -empty -delete

FROM php:8.0-cli AS php
WORKDIR /root/
COPY --from=emscripten /root/typo3 ./typo3

# Strip whitespaces from PHP files.
# PHP >= 8.0 is needed to preserve PHP 8.0 attributes,
# like #[Attribute] and #[Pure]. In PHP 7.4, they are
# treated as comments and removed by the whitespace stripping.
COPY ./build-assets/add-newlines-after-annotations.php /root/
RUN cd typo3 && \
    for phpfile in $(\
    find ./ -type f -name '*.php' \
    -not -path '*wp-content*' \
    # wp-cli expects an unminified wp-config.php
    -not -path '*wp-config.php' \
    -not -path '*wp-config-sample.php' \
    ); do \
    # Remove whitespace from PHP files
    php -w $phpfile > $phpfile.small && \
    # remove set_time_limit function calls as they invoke the
    # setitimer system call unsupported by emscripten
    perl -pe 's/@?set_time_limit\([^)]+\)//g' $phpfile.small > $phpfile && \
    # Add newlines after PHP 8.0 attributes
    php /root/add-newlines-after-annotations.php $phpfile && \
    rm $phpfile.small; \
    done

FROM emscripten as emscripten2
RUN rm -rf ./typo3
COPY --from=php /root/typo3 ./typo3

# Build the final wp.zip file
RUN mv typo3 /typo3 && \
    cp typo3-remote-asset-paths /typo3/ && \
    cp typo3-static.zip /typo3/ && \
    cd /typo3 && \
    zip /root/output/$OUT_FILENAME.zip -r .
