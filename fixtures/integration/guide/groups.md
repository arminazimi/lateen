---
title: Independent example groups
description: Two forms on one page drive only their own terminal and recorded output.
layout: doc
permalink: /guide/groups/
---

## First group

::variables-form{group="first" variables='[{"name":"host","default":"https://first.example.com","type":"url"}]'}

:::terminal{group="first"}
$ curl {{host}}/v1
first ok
:::

:::output-block{group="first" deps='["host"]'}
first output
:::

## Second group

::variables-form{group="second" variables='[{"name":"host","default":"https://second.example.com","type":"url"}]'}

:::terminal{group="second"}
$ curl {{host}}/v1
second ok
:::

:::output-block{group="second" deps='["host"]'}
second output
:::
